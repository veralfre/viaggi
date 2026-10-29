#!/usr/bin/env node
// Storico prezzi voli: per ogni viaggio di src/viaggi.js con `voli.attivo`
// cerca su Google Flights (via SerpApi) tutte le coppie di date andata × ritorno
// e aggiunge le opzioni trovate a public/<slug>/voli.csv.
// Per ogni aeroporto di partenza prende l'andata più economica e chiede i
// ritorni di quell'itinerario (departure_token): è il prezzo vero, andata e ritorno.
// Più i voli di sola andata di chi ospita (`voli.ospiti`, righe tipo=ospiti) e gli
// scenari di confronto (`voli.alternative`), ognuno nel suo public/<slug>/voli-<id>.csv.
//
//   node scripts/voli.mjs                 esecuzione reale (serve SERPAPI_KEY)
//   node scripts/voli.mjs --dry-run       piano e budget, senza chiamate
//   node scripts/voli.mjs --slug <slug>   solo quel viaggio, anche se non attivo (rilevazione una tantum)
//   node scripts/voli.mjs --calibra       verifica se il prezzo è totale o a persona (2 ricerche, non scrive)
//   node scripts/voli.mjs --fixture <dir> [--fixture-scenario vuoto|chiave] [--out <dir>]
//                                         usa risposte salvate al posto di SerpApi
//
// Variabili: SERPAPI_KEY, VOLI_NOW (data ISO per esecuzioni ripetibili).
// Nessuna dipendenza: Node 20+ con fetch nativo.

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { valutaDi, voliOspiti } from '../src/costi.js'
import { viaggi as VIAGGI } from '../src/viaggi.js'
import {
  ErroreFatale,
  RITARDO_RETRY_MS,
  adesso,
  cerca as cercaSerpApi,
  logConsole,
  scriviCsv as scriviCsvComune,
} from './serpapi.mjs'

export { ENDPOINT, ErroreFatale, TIMEOUT_MS, RITARDO_RETRY_MS, csvRiga } from './serpapi.mjs'

export const VALUTA = 'EUR'
export const HL = 'it'
export const GL = 'it'
// Il cron gira ogni 2 giorni (giorni 1, 3, …, 31): al massimo 16 esecuzioni al mese.
export const ESECUZIONI_MESE = 16
export const LIMITE_MESE = 250
// 220: Ovest 2027 breve, due scenari con i voli di chi ospita, fa 13 × 16 = 208 al mese.
export const SOGLIA_AVVISO = 220
// 'totale' = il prezzo restituito vale per tutti gli adulti; 'persona' = già a persona.
// Si verifica con --calibra.
export const PREZZO_BASE = 'totale'

export const HEADER_V1 = [
  'run', 'tipo', 'data_andata', 'data_ritorno', 'sezione', 'rango', 'prezzo', 'valuta', 'adulti', 'base',
  'prezzo_persona', 'compagnie', 'scali', 'aeroporti_scalo', 'durata_min', 'da', 'a', 'partenza', 'arrivo',
  'voli', 'migliore',
]
// v2: colonna `gruppo` = itinerario verificato (andata + ritorni dello stesso follow-up).
export const HEADER = [...HEADER_V1, 'gruppo']

const RADICE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** Viaggi con voli.attivo === true e almeno una data di andata da oggi in poi. */
export function attivi(viaggi, oggi) {
  return viaggi.filter((v) => v.voli?.attivo === true && v.voli.andata.date.some((d) => d >= oggi))
}

/**
 * Coppie andata × ritorno, scartando i ritorni non successivi all'andata e,
 * se si passa `oggi` (YYYY-MM-DD), le andate già passate.
 */
export function coppie(voli, oggi = '') {
  const out = []
  for (const andata of voli.andata.date) {
    if (oggi && andata < oggi) continue
    for (const ritorno of voli.ritorno.date) {
      if (ritorno > andata) out.push({ andata, ritorno })
    }
  }
  return out
}

/**
 * Scenari di ricerca di un viaggio: il principale (public/<slug>/voli.csv) e le
 * alternative di `voli.alternative` (public/<slug>/voli-<id>.csv), stessi adulti.
 */
export function scenari(v) {
  const alt = (v.voli.alternative ?? []).map((a) => ({
    id: a.id,
    csv: a.csv ?? 'voli-' + a.id + '.csv',
    voli: { adulti: a.adulti ?? v.voli.adulti, andata: a.andata, ritorno: a.ritorno, ospiti: a.ospiti ?? [] },
  }))
  return [{ id: '', csv: 'voli.csv', voli: v.voli }, ...alt]
}

/**
 * Ricerche di sola andata di chi ospita, una per tratta e data da oggi in poi:
 * { id, voce, adulti, da, a, data, tipo }. tipo = 'ospiti' (lista `voli.ospiti`)
 * o 'rientro' (vecchia forma `voli.rientroOspiti`, righe che la pagina lunga legge così).
 */
export function tratteOspiti(voli, oggi = '') {
  const tipo = Array.isArray(voli?.ospiti) ? 'ospiti' : 'rientro'
  return voliOspiti(voli).flatMap((t) => t.date.filter((d) => !oggi || d >= oggi).map((data) => ({ ...t, data, tipo })))
}

/** Date del rientro di chi ospita (vecchia forma, per compatibilità). */
export const rientri = (voli, oggi = '') => tratteOspiti(voli, oggi).map((t) => t.data)

/** Ricerche per esecuzione di uno scenario: coppie + una per aeroporto di partenza + chi ospita; 0 senza coppie future. */
export function ricercheScenario(voli, oggi = '') {
  const n = coppie(voli, oggi).length
  return n ? n + voli.andata.da.length + tratteOspiti(voli, oggi).length : 0
}

/** Ricerche per esecuzione (somma su viaggi e scenari) e stima mensile. */
export function stimaBudget(trips, oggi = '') {
  const perEsecuzione = trips.reduce((n, v) => n + scenari(v).reduce((m, s) => m + ricercheScenario(s.voli, oggi), 0), 0)
  const alMese = perEsecuzione * ESECUZIONI_MESE
  const livello = alMese > LIMITE_MESE ? 'errore' : alMese > SOGLIA_AVVISO ? 'avviso' : 'ok'
  return { perEsecuzione, alMese, livello }
}

/** Parametri della ricerca multi-city per una coppia di date. */
export function parametri(voli, coppia, extra = {}) {
  const tratte = [
    { departure_id: voli.andata.da.join(','), arrival_id: voli.andata.a.join(','), date: coppia.andata },
    { departure_id: voli.ritorno.da.join(','), arrival_id: voli.ritorno.a.join(','), date: coppia.ritorno },
  ]
  const p = new URLSearchParams({
    engine: 'google_flights',
    type: '3',
    adults: String(extra.adults ?? voli.adulti),
    currency: VALUTA,
    hl: HL,
    gl: GL,
    multi_city_json: JSON.stringify(tratte),
  })
  for (const [k, v] of Object.entries(extra)) {
    if (k !== 'adults' && v != null) p.set(k, String(v))
  }
  return p
}

/** Parametri della ricerca di solo andata (type=2) per un volo di chi ospita. */
export function parametriOspiti(tratta, data, extra = {}) {
  const p = new URLSearchParams({
    engine: 'google_flights',
    type: '2',
    departure_id: tratta.da.join(','),
    arrival_id: tratta.a.join(','),
    outbound_date: data,
    adults: String(tratta.adulti),
    currency: VALUTA,
    hl: HL,
    gl: GL,
  })
  for (const [k, v] of Object.entries(extra)) if (v != null) p.set(k, String(v))
  return p
}
export const parametriRientro = parametriOspiti

/** Opzioni di volo (best_flights + other_flights) in forma piatta. */
export function opzioni(json) {
  const out = []
  for (const [chiave, sezione] of [['best_flights', 'best'], ['other_flights', 'other']]) {
    let rango = 0
    for (const o of json?.[chiave] ?? []) {
      if (typeof o?.price !== 'number' || !Number.isFinite(o.price)) continue
      const voli = Array.isArray(o.flights) ? o.flights : []
      const scali = Array.isArray(o.layovers) ? o.layovers : []
      rango++
      out.push({
        sezione,
        rango,
        prezzo: o.price,
        compagnie: [...new Set(voli.map((f) => f.airline).filter(Boolean))].join(' + '),
        scali: scali.length,
        aeroporti_scalo: scali.map((l) => l.id).filter(Boolean).join(' '),
        durata_min: o.total_duration ?? '',
        da: voli[0]?.departure_airport?.id ?? '',
        a: voli.at(-1)?.arrival_airport?.id ?? '',
        partenza: voli[0]?.departure_airport?.time ?? '',
        arrivo: voli.at(-1)?.arrival_airport?.time ?? '',
        voli: voli.map((f) => f.flight_number).filter(Boolean).join(' '),
        token: o.departure_token ?? null,
      })
    }
  }
  return out
}

export const prezzoPersona = (prezzo, adulti, base) =>
  base === 'totale' ? Math.round((prezzo / adulti) * 100) / 100 : prezzo

/**
 * Righe CSV (array) per un gruppo di opzioni della stessa ricerca.
 * `segna(o)` → { migliore: bool, gruppo: n | '' } per ogni opzione.
 */
export function righe({ run, tipo, coppia, adulti, base = PREZZO_BASE, valuta = VALUTA, opts, segna = () => ({}) }) {
  return opts.map((o) => {
    const s = segna(o) || {}
    return [
      run, tipo, coppia.andata, coppia.ritorno, o.sezione, o.rango, o.prezzo, valuta, adulti, base,
      prezzoPersona(o.prezzo, adulti, base), o.compagnie, o.scali, o.aeroporti_scalo, o.durata_min,
      o.da, o.a, o.partenza, o.arrivo, o.voli, s.migliore ? 1 : '', s.gruppo ?? '',
    ]
  })
}

/** Ordine: prezzo, poi meno scali, poi durata minore. */
export function piuEconomica(opts) {
  const n = (x) => (typeof x === 'number' ? x : Infinity)
  return [...opts].sort((a, b) => a.prezzo - b.prezzo || a.scali - b.scali || n(a.durata_min) - n(b.durata_min))[0] ?? null
}

/** Ricerca SerpApi per i voli ("vuota" = errore senza opzioni). */
export function cerca(params, opts = {}) {
  return cercaSerpApi(params, { ...opts, conta: (json) => opzioni(json).length })
}

/**
 * fetch finto che risponde con i file JSON di una cartella di fixture:
 * andata.json, rientro.json per la solo andata (type=2), oppure per i follow-up
 * ritorno-<token>.json se esiste, altrimenti ritorno.json.
 */
export function fetchFixture(dir, scenario = '') {
  const leggi = (nome) => JSON.parse(readFileSync(path.join(dir, nome + '.json'), 'utf8'))
  return async (url) => {
    const p = new URL(url).searchParams
    const token = p.get('departure_token')
    let nome = p.get('type') === '2' ? 'rientro' : 'andata'
    if (token) nome = existsSync(path.join(dir, 'ritorno-' + token + '.json')) ? 'ritorno-' + token : 'ritorno'
    let status = 200
    if (scenario === 'vuoto') nome = 'vuoto'
    if (scenario === 'chiave') {
      nome = 'chiave'
      status = 401
    }
    const corpo = leggi(nome)
    return { ok: status < 400, status, json: async () => corpo }
  }
}

/** Accoda al CSV dei voli (migra da HEADER_V1 se serve). */
export function scriviCsv(file, rows) {
  scriviCsvComune(file, HEADER, rows, [HEADER_V1])
}

/** Nome di uno scenario nei messaggi: lo slug, con l'id tra parentesi quadre per le alternative. */
const nomeScenario = (v, s) => v.slug + (s.id ? ' [' + s.id + ']' : '')

/**
 * Viaggi da cercare. Senza slug: quelli attivi con date future. Con slug: quel viaggio
 * anche se `attivo: false` (rilevazione una tantum), purché abbia i voli e una data futura.
 */
export function selezione(viaggi, oggi, slug, log = logConsole) {
  if (slug) {
    const v = viaggi.find((x) => x.slug === slug)
    if (!v) {
      log.info(slug + ': nessun viaggio con questo slug')
      return []
    }
    if (!v.voli) {
      log.info(slug + ': il viaggio non ha voli da cercare')
      return []
    }
    if (!v.voli.andata.date.some((d) => d >= oggi)) {
      log.info(slug + ': date di andata già passate, salto')
      return []
    }
    if (v.voli.attivo !== true) log.info(slug + ': non attivo, cercato una volta perché richiesto con --slug')
    return [v]
  }
  for (const v of viaggi) {
    if (v.voli?.attivo === true && !v.voli.andata.date.some((d) => d >= oggi)) {
      log.info(v.slug + ': date di andata già passate, salto')
    }
  }
  return attivi(viaggi, oggi)
}

function controllaBudget(trips, oggi, log) {
  // Solo viaggi non attivi (scelti con --slug): una rilevazione una tantum, il limite vale per
  // questa esecuzione e non per 16 esecuzioni al mese.
  if (trips.length && trips.every((v) => v.voli?.attivo !== true)) {
    const n = stimaBudget(trips, oggi).perEsecuzione
    const u = { perEsecuzione: n, alMese: n, livello: n > LIMITE_MESE ? 'errore' : n > SOGLIA_AVVISO ? 'avviso' : 'ok' }
    const msg = 'Esecuzione una tantum: ' + n + ' ricerche (fuori dal budget mensile dei viaggi attivi, limite ' + LIMITE_MESE + ')'
    if (u.livello === 'errore') log.error(msg + ': troppe, riduci le date')
    else if (u.livello === 'avviso') log.warn(msg + ': vicino al limite')
    else log.info(msg)
    return u
  }
  const b = stimaBudget(trips, oggi)
  const msg =
    'Budget SerpApi: ' + b.perEsecuzione + ' ricerche per esecuzione, circa ' + b.alMese +
    ' al mese (' + ESECUZIONI_MESE + ' esecuzioni, limite ' + LIMITE_MESE + ')'
  if (b.livello === 'errore') log.error(msg + ': troppe, riduci date o viaggi attivi')
  else if (b.livello === 'avviso') log.warn(msg + ': vicino al limite')
  else log.info(msg)
  return b
}

/** Esecuzione per uno scenario (`nome` per i messaggi): ritorna { rows } oppure { errore }. */
async function cercaScenario(nome, voli, run, { apiKey, fetchImpl, ritardoRetry, log, valuta = VALUTA, gl }) {
  const v = { slug: nome, voli }
  const lista = coppie(v.voli, run.slice(0, 10))
  const trovate = []
  let fallite = 0
  for (const c of lista) {
    const r = await cerca(parametri(v.voli, c, { api_key: apiKey, currency: valuta, gl }), { fetchImpl, ritardoRetry })
    if (r.stato === 'fallito') {
      fallite++
      log.warn(v.slug + ' ' + c.andata + ' → ' + c.ritorno + ': ricerca fallita (' + r.motivo + ')')
      continue
    }
    if (r.stato === 'vuoto') log.warn(v.slug + ' ' + c.andata + ' → ' + c.ritorno + ': nessun risultato (' + r.motivo + ')')
    const opts = opzioni(r.json)
    trovate.push({ coppia: c, opts })
    log.info(v.slug + ' ' + c.andata + ' → ' + c.ritorno + ': ' + opts.length + ' opzioni')
  }
  const totale = trovate.reduce((n, t) => n + t.opts.length, 0)
  if (fallite > lista.length / 2 || totale === 0) {
    return { errore: v.slug + ': ' + fallite + ' ricerche fallite su ' + lista.length + ', ' + totale + ' opzioni: non aggiorno il CSV' }
  }

  // Un follow-up per aeroporto di partenza: l'andata più economica (con token) da lì,
  // tra tutte le coppie di date, e i ritorni di quell'itinerario.
  const conToken = trovate.flatMap((t) => t.opts.filter((o) => o.token).map((o) => ({ ...o, coppia: t.coppia, orig: o })))
  const gruppoDi = new Map()
  const ritorni = []
  let n = 0
  for (const da of v.voli.andata.da) {
    const scelta = piuEconomica(conToken.filter((o) => o.da === da))
    if (!scelta) {
      log.warn(v.slug + ' ' + da + ': nessuna andata con departure_token, salto il ritorno')
      continue
    }
    let opts = []
    let motivo = ''
    try {
      const r = await cerca(parametri(v.voli, scelta.coppia, { api_key: apiKey, departure_token: scelta.token, currency: valuta, gl }), {
        fetchImpl,
        ritardoRetry,
      })
      opts = r.stato === 'fallito' ? [] : opzioni(r.json)
      motivo = r.motivo || 'nessuna opzione'
    } catch (e) {
      if (!(e instanceof ErroreFatale)) throw e
      motivo = e.message
    }
    if (!opts.length) {
      log.warn(v.slug + ' ' + da + ': dettagli del ritorno non disponibili (' + motivo + ')')
      continue
    }
    n++
    gruppoDi.set(scelta.orig, n)
    // Aeroporti misti esclusi: il migliore è il ritorno più economico verso lo stesso aeroporto.
    const migliore = piuEconomica(opts.filter((o) => o.a === da))
    if (!migliore) log.warn(v.slug + ' ' + da + ': nessun ritorno verso ' + da + ' in questa rilevazione')
    ritorni.push({ coppia: scelta.coppia, opts, gruppo: n, migliore })
  }

  const adulti = v.voli.adulti
  const rows = trovate.flatMap((t) =>
    righe({
      run, tipo: 'andata', coppia: t.coppia, adulti, valuta, opts: t.opts,
      segna: (o) => (gruppoDi.has(o) ? { migliore: true, gruppo: gruppoDi.get(o) } : {}),
    }),
  )
  for (const r of ritorni) {
    rows.push(
      ...righe({
        run, tipo: 'ritorno', coppia: r.coppia, adulti, valuta, opts: r.opts,
        segna: (o) => ({ migliore: o === r.migliore, gruppo: r.gruppo }),
      }),
    )
  }

  // Voli di chi ospita (solo andata): righe tipo 'ospiti' (o 'rientro' nella vecchia forma),
  // data_ritorno e gruppo vuoti, migliore sulla più economica di ogni tratta e data.
  // Se una ricerca fallisce è solo un avviso: non blocca il resto del CSV.
  for (const ro of tratteOspiti(v.voli, run.slice(0, 10))) {
    const data = ro.data
    let opts = []
    let motivo = ''
    try {
      const r = await cerca(parametriOspiti(ro, data, { api_key: apiKey, currency: valuta, gl }), { fetchImpl, ritardoRetry })
      opts = r.stato === 'fallito' ? [] : opzioni(r.json)
      motivo = r.motivo || 'nessuna opzione'
    } catch (e) {
      if (!(e instanceof ErroreFatale)) throw e
      motivo = e.message
    }
    if (!opts.length) {
      log.warn(v.slug + ' ' + ro.id + ' ' + ro.da.join(',') + ' → ' + ro.a.join(',') + ' ' + data + ': nessun prezzo (' + motivo + ')')
      continue
    }
    log.info(v.slug + ' ' + ro.id + ' ' + ro.da.join(',') + ' → ' + ro.a.join(',') + ' ' + data + ': ' + opts.length + ' opzioni')
    const migliore = piuEconomica(opts)
    rows.push(
      ...righe({
        run, tipo: ro.tipo, coppia: { andata: data, ritorno: '' }, adulti: ro.adulti, valuta, opts,
        segna: (o) => ({ migliore: o === migliore }),
      }),
    )
  }
  return { rows }
}

/**
 * Esecuzione completa. Ritorna il codice di uscita (0 ok, 1 errore).
 * opzioni: { viaggi, now, apiKey, fetchImpl, outDir, slug, dryRun, calibra, ritardoRetry, log }
 */
export async function esegui({
  viaggi = VIAGGI,
  now,
  apiKey,
  fetchImpl = fetch,
  outDir = path.join(RADICE, 'public'),
  slug = '',
  dryRun = false,
  calibra = false,
  ritardoRetry = RITARDO_RETRY_MS,
  log = logConsole,
} = {}) {
  try {
    const run = adesso(now, 'VOLI_NOW')
    const oggi = run.slice(0, 10)
    const trips = selezione(viaggi, oggi, slug, log)
    if (!trips.length) {
      log.info((slug ? 'Nessun viaggio da cercare con slug ' + slug : 'Nessun viaggio attivo') + ': niente da cercare.')
      return slug ? 1 : 0
    }

    if (dryRun) {
      for (const v of trips) {
        for (const s of scenari(v)) {
          const sv = s.voli
          const lista = coppie(sv, oggi)
          const k = sv.andata.da.length
          const tratte = tratteOspiti(sv, oggi)
          log.info(
            nomeScenario(v, s) + ' (' + s.csv + '): ' + sv.adulti + ' adulti, ' + sv.andata.da.join(',') + ' → ' + sv.andata.a.join(',') +
              ' / ' + sv.ritorno.da.join(',') + ' → ' + sv.ritorno.a.join(',') + ', ' + lista.length +
              ' coppie di date + ' + k + ' ricerche per i ritorni (una per aeroporto) + ' + tratte.length +
              ' voli di chi ospita = ' + ricercheScenario(sv, oggi) + ' ricerche',
          )
          if (!lista.length) log.info('  date di andata già passate, salto lo scenario')
          for (const c of lista) log.info('  ' + c.andata + ' → ' + c.ritorno)
          for (const t of tratte) {
            log.info('  + chi ospita, solo andata (' + t.id + '): ' + t.da.join(',') + ' → ' + t.a.join(',') + ' ' + t.data + ', ' + t.adulti + ' adulti (1 ricerca)')
          }
        }
      }
      return controllaBudget(trips, oggi, log).livello === 'errore' ? 1 : 0
    }

    if (!apiKey) throw new ErroreFatale('SERPAPI_KEY mancante')

    if (calibra) {
      const v = trips[0]
      const c = coppie(v.voli, oggi)[0]
      const valuta = valutaDi(v)
      const minimo = async (adults) => {
        const r = await cerca(parametri(v.voli, c, { api_key: apiKey, adults, currency: valuta, gl: v.voli.gl }), { fetchImpl, ritardoRetry })
        const o = r.stato === 'fallito' ? null : piuEconomica(opzioni(r.json))
        if (!o) throw new ErroreFatale('calibrazione: nessuna opzione per ' + adults + ' adulti (' + (r.motivo || '') + ')')
        return o.prezzo
      }
      const pN = await minimo(v.voli.adulti)
      const p1 = await minimo(1)
      const rapporto = pN / p1
      log.info(
        v.slug + ' ' + c.andata + ' → ' + c.ritorno + ': ' + v.voli.adulti + ' adulti ' + pN + ' ' + valuta +
          ', 1 adulto ' + p1 + ' ' + valuta + ', rapporto ' + rapporto.toFixed(2),
      )
      log.info(
        rapporto >= 2
          ? 'Il prezzo è il TOTALE per tutti gli adulti (default OK)'
          : "Il prezzo sembra A PERSONA: impostare PREZZO_BASE='persona' in scripts/voli.mjs",
      )
      return 0
    }

    if (controllaBudget(trips, oggi, log).livello === 'errore') return 1

    // Ogni scenario scrive il suo CSV: l'errore di uno non blocca gli altri (ma il codice è 1).
    let codice = 0
    for (const v of trips) {
      for (const s of scenari(v)) {
        const nome = nomeScenario(v, s)
        if (!coppie(s.voli, oggi).length) {
          log.info(nome + ': date di andata già passate, salto')
          continue
        }
        let esito
        try {
          esito = await cercaScenario(nome, s.voli, run, { apiKey, fetchImpl, ritardoRetry, log, valuta: valutaDi(v), gl: v.voli.gl })
        } catch (e) {
          // Richiesta rifiutata (HTTP 400): riguarda solo questo scenario. Chiave e limite valgono per tutti.
          if (!(e instanceof ErroreFatale) || !/HTTP 400/.test(e.message)) throw e
          esito = { errore: nome + ': ' + e.message }
        }
        if (esito.errore) {
          log.error(esito.errore)
          codice = 1
          continue
        }
        const file = path.join(outDir, v.slug, s.csv)
        try {
          scriviCsv(file, esito.rows)
          log.info(nome + ': ' + esito.rows.length + ' righe aggiunte a ' + path.relative(process.cwd(), file))
        } catch (e) {
          log.error(e.message)
          codice = 1
        }
      }
    }
    return codice
  } catch (e) {
    if (e instanceof ErroreFatale) {
      log.error(e.message)
      return 1
    }
    throw e
  }
}

function argomenti(argv) {
  const a = { dryRun: false, calibra: false, slug: '', fixture: '', scenario: '', out: '' }
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i]
    if (k === '--dry-run') a.dryRun = true
    else if (k === '--calibra') a.calibra = true
    else if (k === '--slug') a.slug = argv[++i] ?? ''
    else if (k === '--fixture') a.fixture = argv[++i] ?? ''
    else if (k === '--fixture-scenario') a.scenario = argv[++i] ?? ''
    else if (k === '--out') a.out = argv[++i] ?? ''
    else if (k === '') continue
    else throw new ErroreFatale('argomento sconosciuto: ' + k)
  }
  return a
}

async function main() {
  let a
  try {
    a = argomenti(process.argv.slice(2))
  } catch (e) {
    logConsole.error(e.message)
    process.exit(1)
  }
  const opts = { now: process.env.VOLI_NOW || undefined, slug: a.slug, dryRun: a.dryRun, calibra: a.calibra }
  if (a.out) opts.outDir = path.resolve(a.out)
  if (a.fixture) {
    opts.fetchImpl = fetchFixture(path.resolve(a.fixture), a.scenario)
    opts.apiKey = 'fixture'
    opts.ritardoRetry = 0
  } else {
    opts.apiKey = process.env.SERPAPI_KEY
  }
  process.exitCode = await esegui(opts)
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main()
}

