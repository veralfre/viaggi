#!/usr/bin/env node
// Storico prezzi voli: per ogni viaggio di src/viaggi.js con `voli.attivo`
// cerca su Google Flights (via SerpApi) tutte le coppie di date andata × ritorno
// e aggiunge le opzioni trovate a public/<slug>/voli.csv.
//
//   node scripts/voli.mjs                 esecuzione reale (serve SERPAPI_KEY)
//   node scripts/voli.mjs --dry-run       piano e budget, senza chiamate
//   node scripts/voli.mjs --slug <slug>   solo quel viaggio
//   node scripts/voli.mjs --calibra       verifica se il prezzo è totale o a persona (2 ricerche, non scrive)
//   node scripts/voli.mjs --fixture <dir> [--fixture-scenario vuoto|chiave] [--out <dir>]
//                                         usa risposte salvate al posto di SerpApi
//
// Variabili: SERPAPI_KEY, VOLI_NOW (data ISO per esecuzioni ripetibili).
// Nessuna dipendenza: Node 20+ con fetch nativo.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { viaggi as VIAGGI } from '../src/viaggi.js'

export const ENDPOINT = 'https://serpapi.com/search.json'
export const VALUTA = 'EUR'
export const HL = 'it'
export const GL = 'it'
// Il cron gira ogni 2 giorni (giorni 1, 3, …, 31): al massimo 16 esecuzioni al mese.
export const ESECUZIONI_MESE = 16
export const LIMITE_MESE = 250
export const SOGLIA_AVVISO = 200
// 'totale' = il prezzo restituito vale per tutti gli adulti; 'persona' = già a persona.
// Si verifica con --calibra.
export const PREZZO_BASE = 'totale'
export const TIMEOUT_MS = 60000
export const RITARDO_RETRY_MS = 5000

export const HEADER = [
  'run', 'tipo', 'data_andata', 'data_ritorno', 'sezione', 'rango', 'prezzo', 'valuta', 'adulti', 'base',
  'prezzo_persona', 'compagnie', 'scali', 'aeroporti_scalo', 'durata_min', 'da', 'a', 'partenza', 'arrivo',
  'voli', 'migliore',
]

const RADICE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export class ErroreFatale extends Error {}

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

/** Ricerche per esecuzione (una per coppia + una per il ritorno) e stima mensile. */
export function stimaBudget(trips, oggi = '') {
  const perEsecuzione = trips.reduce((n, v) => n + coppie(v.voli, oggi).length + 1, 0)
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

/** Righe CSV (array) per un gruppo di opzioni della stessa ricerca. */
export function righe({ run, tipo, coppia, adulti, base = PREZZO_BASE, valuta = VALUTA, opts, migliore = null }) {
  return opts.map((o) => [
    run, tipo, coppia.andata, coppia.ritorno, o.sezione, o.rango, o.prezzo, valuta, adulti, base,
    prezzoPersona(o.prezzo, adulti, base), o.compagnie, o.scali, o.aeroporti_scalo, o.durata_min,
    o.da, o.a, o.partenza, o.arrivo, o.voli, o === migliore ? 1 : '',
  ])
}

/** Una riga CSV, con le virgolette solo dove servono (RFC 4180). */
export function csvRiga(arr) {
  return arr
    .map((v) => {
      const s = v == null ? '' : String(v)
      return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
    })
    .join(',')
}

/** Ordine: prezzo, poi meno scali, poi durata minore. */
export function piuEconomica(opts) {
  const n = (x) => (typeof x === 'number' ? x : Infinity)
  return [...opts].sort((a, b) => a.prezzo - b.prezzo || a.scali - b.scali || n(a.durata_min) - n(b.durata_min))[0] ?? null
}

const dorme = (ms) => new Promise((r) => setTimeout(r, ms))

function oscurata(params) {
  const p = new URLSearchParams(params)
  if (p.has('api_key')) p.set('api_key', '***')
  return p.toString()
}

/**
 * Una ricerca SerpApi.
 * Ritorna { stato: 'ok' | 'vuoto' | 'fallito', json?, motivo? }; lancia ErroreFatale
 * per chiave non valida, limite superato o richiesta sbagliata.
 */
export async function cerca(params, { fetchImpl = fetch, ritardoRetry = RITARDO_RETRY_MS } = {}) {
  let motivo = ''
  for (let tentativo = 0; tentativo < 2; tentativo++) {
    if (tentativo) await dorme(ritardoRetry)
    let res
    let json = null
    try {
      res = await fetchImpl(ENDPOINT + '?' + params.toString(), { signal: AbortSignal.timeout(TIMEOUT_MS) })
      try {
        json = await res.json()
      } catch {
        json = null
      }
    } catch (e) {
      motivo = 'errore di rete: ' + (e?.message || e)
      continue
    }
    const errore = typeof json?.error === 'string' ? json.error : ''
    if (res.status === 401 || res.status === 403 || /api key/i.test(errore)) {
      throw new ErroreFatale('chiave SerpApi non valida o non autorizzata (HTTP ' + res.status + ')')
    }
    if (res.status === 429) throw new ErroreFatale('limite di ricerche SerpApi superato (HTTP 429): ' + errore)
    if (res.status === 400) {
      throw new ErroreFatale('richiesta rifiutata (HTTP 400): ' + errore + ' — parametri: ' + oscurata(params))
    }
    if (res.status >= 500 || !res.ok || json == null || json?.search_metadata?.status === 'Error') {
      motivo = 'HTTP ' + res.status + (errore ? ': ' + errore : '')
      continue
    }
    if (errore && opzioni(json).length === 0) return { stato: 'vuoto', json, motivo: errore }
    return { stato: 'ok', json }
  }
  return { stato: 'fallito', motivo }
}

/** fetch finto che risponde con i file JSON di una cartella di fixture. */
export function fetchFixture(dir, scenario = '') {
  const leggi = (nome) => JSON.parse(readFileSync(path.join(dir, nome + '.json'), 'utf8'))
  return async (url) => {
    const p = new URL(url).searchParams
    let nome = p.has('departure_token') ? 'ritorno' : 'andata'
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

const logConsole = {
  info: (m) => console.log(m),
  warn: (m) => console.log('::warning::' + m),
  error: (m) => console.log('::error::' + m),
}

/** Accoda le righe al CSV del viaggio senza mai lasciarlo a metà. */
export function scriviCsv(file, rows) {
  const intestazione = HEADER.join(',')
  let prima = ''
  if (existsSync(file)) prima = readFileSync(file, 'utf8')
  if (prima !== '') {
    const riga1 = prima.split(/\r?\n/, 1)[0]
    if (riga1 !== intestazione) {
      throw new Error(file + ': intestazione diversa da quella attesa, non scrivo nulla')
    }
    if (prima && !prima.endsWith('\n')) prima += '\n'
  } else {
    prima = intestazione + '\n'
  }
  mkdirSync(path.dirname(file), { recursive: true })
  const tmp = file + '.tmp'
  writeFileSync(tmp, prima + rows.map(csvRiga).join('\n') + '\n')
  renameSync(tmp, file)
}

function adesso(now) {
  const d = now ? new Date(now) : new Date()
  if (Number.isNaN(d.getTime())) throw new ErroreFatale('VOLI_NOW non è una data valida: ' + now)
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

function selezione(viaggi, oggi, slug, log) {
  for (const v of viaggi) {
    if (v.voli?.attivo === true && !v.voli.andata.date.some((d) => d >= oggi)) {
      log.info(v.slug + ': date di andata già passate, salto')
    }
  }
  let trips = attivi(viaggi, oggi)
  if (slug) trips = trips.filter((v) => v.slug === slug)
  return trips
}

function controllaBudget(trips, oggi, log) {
  const b = stimaBudget(trips, oggi)
  const msg =
    'Budget SerpApi: ' + b.perEsecuzione + ' ricerche per esecuzione, circa ' + b.alMese +
    ' al mese (' + ESECUZIONI_MESE + ' esecuzioni, limite ' + LIMITE_MESE + ')'
  if (b.livello === 'errore') log.error(msg + ': troppe, riduci date o viaggi attivi')
  else if (b.livello === 'avviso') log.warn(msg + ': vicino al limite')
  else log.info(msg)
  return b
}

/** Esecuzione per un viaggio: ritorna { rows } oppure { errore }. */
async function cercaViaggio(v, run, { apiKey, fetchImpl, ritardoRetry, log }) {
  const lista = coppie(v.voli, run.slice(0, 10))
  const trovate = []
  let fallite = 0
  for (const c of lista) {
    const r = await cerca(parametri(v.voli, c, { api_key: apiKey }), { fetchImpl, ritardoRetry })
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

  // Dettagli del ritorno per l'opzione più economica dell'intera esecuzione.
  const conToken = trovate.flatMap((t) => t.opts.filter((o) => o.token).map((o) => ({ ...o, coppia: t.coppia, orig: o })))
  const scelta = piuEconomica(conToken)
  let ritorno = null
  if (scelta) {
    try {
      const r = await cerca(parametri(v.voli, scelta.coppia, { api_key: apiKey, departure_token: scelta.token }), {
        fetchImpl,
        ritardoRetry,
      })
      const opts = r.stato === 'fallito' ? [] : opzioni(r.json)
      if (opts.length) ritorno = { coppia: scelta.coppia, opts }
      else log.warn(v.slug + ': dettagli del ritorno non disponibili (' + (r.motivo || 'nessuna opzione') + ')')
    } catch (e) {
      if (!(e instanceof ErroreFatale)) throw e
      log.warn(v.slug + ': dettagli del ritorno non disponibili (' + e.message + ')')
    }
  } else {
    log.warn(v.slug + ': nessuna opzione con departure_token, salto i dettagli del ritorno')
  }

  const adulti = v.voli.adulti
  const rows = trovate.flatMap((t) =>
    righe({ run, tipo: 'andata', coppia: t.coppia, adulti, opts: t.opts, migliore: scelta?.orig }),
  )
  if (ritorno) {
    rows.push(
      ...righe({ run, tipo: 'ritorno', coppia: ritorno.coppia, adulti, opts: ritorno.opts, migliore: piuEconomica(ritorno.opts) }),
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
    const run = adesso(now)
    const oggi = run.slice(0, 10)
    const trips = selezione(viaggi, oggi, slug, log)
    if (!trips.length) {
      log.info('Nessun viaggio attivo' + (slug ? ' con slug ' + slug : '') + ': niente da cercare.')
      return slug ? 1 : 0
    }

    if (dryRun) {
      for (const v of trips) {
        const lista = coppie(v.voli, oggi)
        log.info(
          v.slug + ': ' + v.voli.adulti + ' adulti, ' + v.voli.andata.da.join(',') + ' → ' + v.voli.andata.a.join(',') +
            ' / ' + v.voli.ritorno.da.join(',') + ' → ' + v.voli.ritorno.a.join(',') + ', ' + lista.length +
            ' coppie di date + 1 ricerca per il ritorno = ' + (lista.length + 1) + ' ricerche',
        )
        for (const c of lista) log.info('  ' + c.andata + ' → ' + c.ritorno)
      }
      return controllaBudget(trips, oggi, log).livello === 'errore' ? 1 : 0
    }

    if (!apiKey) throw new ErroreFatale('SERPAPI_KEY mancante')

    if (calibra) {
      const v = trips[0]
      const c = coppie(v.voli, oggi)[0]
      const minimo = async (adults) => {
        const r = await cerca(parametri(v.voli, c, { api_key: apiKey, adults }), { fetchImpl, ritardoRetry })
        const o = r.stato === 'fallito' ? null : piuEconomica(opzioni(r.json))
        if (!o) throw new ErroreFatale('calibrazione: nessuna opzione per ' + adults + ' adulti (' + (r.motivo || '') + ')')
        return o.prezzo
      }
      const pN = await minimo(v.voli.adulti)
      const p1 = await minimo(1)
      const rapporto = pN / p1
      log.info(
        v.slug + ' ' + c.andata + ' → ' + c.ritorno + ': ' + v.voli.adulti + ' adulti ' + pN + ' ' + VALUTA +
          ', 1 adulto ' + p1 + ' ' + VALUTA + ', rapporto ' + rapporto.toFixed(2),
      )
      log.info(
        rapporto >= 2
          ? 'Il prezzo è il TOTALE per tutti gli adulti (default OK)'
          : "Il prezzo sembra A PERSONA: impostare PREZZO_BASE='persona' in scripts/voli.mjs",
      )
      return 0
    }

    if (controllaBudget(trips, oggi, log).livello === 'errore') return 1

    let codice = 0
    for (const v of trips) {
      const esito = await cercaViaggio(v, run, { apiKey, fetchImpl, ritardoRetry, log })
      if (esito.errore) {
        log.error(esito.errore)
        codice = 1
        continue
      }
      const file = path.join(outDir, v.slug, 'voli.csv')
      try {
        scriviCsv(file, esito.rows)
        log.info(v.slug + ': ' + esito.rows.length + ' righe aggiunte a ' + path.relative(process.cwd(), file))
      } catch (e) {
        log.error(e.message)
        codice = 1
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
