#!/usr/bin/env node
// Storico prezzi alloggi: per ogni viaggio di src/viaggi.js con `alloggi.attivo`
// cerca case intere su Airbnb e Booking.com (via SerpApi) per ogni tappa futura
// e aggiunge tutte le strutture trovate a public/<slug>/alloggi.csv.
//
//   node scripts/alloggi.mjs                 esecuzione reale (serve SERPAPI_KEY_ALLOGGI)
//   node scripts/alloggi.mjs --dry-run       piano e budget, senza chiamate
//   node scripts/alloggi.mjs --slug <slug>   solo quel viaggio, anche se non attivo (rilevazione una tantum)
//   node scripts/alloggi.mjs --fixture <dir> [--fixture-scenario vuoto|chiave] [--out <dir>]
//
// Variabili: SERPAPI_KEY_ALLOGGI (chiave e budget separati dai voli), ALLOGGI_NOW.

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { notti as nottiTra, valutaDi } from '../src/costi.js'
import { viaggi as VIAGGI } from '../src/viaggi.js'
import { ErroreFatale, RITARDO_RETRY_MS, adesso, cerca as cercaSerpApi, logConsole, scriviCsv as scriviCsvComune } from './serpapi.mjs'

export const VALUTA = 'EUR'
// Budget separato da quello dei voli (altra chiave SerpApi).
export const ESECUZIONI_MESE = 16
export const LIMITE_MESE = 250
export const SOGLIA_AVVISO = 200
export const FONTI = ['airbnb', 'booking']
// Tipi di struttura Booking (property_types) di default: 201 appartamenti, 220 case vacanza.
// Per viaggio con `alloggi.tipi` (es. per due: anche 204 hotel, 208 B&B, 216 guest house, 221 lodge).
export const TIPI_BOOKING = ['201', '220']

export const HEADER_V1 = [
  'run', 'fonte', 'tappa', 'luogo', 'check_in', 'check_out', 'notti', 'adulti', 'camere_min', 'bagni_min',
  'rango', 'nome', 'tipo', 'totale', 'a_notte', 'tasse', 'valuta', 'camere', 'bagni', 'letti', 'ospiti',
  'valutazione', 'scala', 'recensioni', 'info', 'link', 'id',
]
// v2: coordinate e distanza dal centro della tappa (le righe v1 vengono migrate con i campi vuoti).
export const HEADER = [...HEADER_V1, 'lat', 'lon', 'distanza_km']
export const RAGGIO_KM = 25

/** Distanza in km tra due punti [lat, lon] (formula dell'emisenoverso). */
export function distanzaKm(a, b) {
  const rad = (x) => (x * Math.PI) / 180
  const dLat = rad(b[0] - a[0])
  const dLon = rad(b[1] - a[1])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLon / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

/** Riquadro attorno a un centro: { north, east, south, west } a raggioKm in ogni direzione. */
export function riquadro(centro, km) {
  const dLat = km / 111.32
  const dLon = km / (111.32 * Math.cos((centro[0] * Math.PI) / 180))
  const f = (x) => Number(x.toFixed(4))
  return { north: f(centro[0] + dLat), east: f(centro[1] + dLon), south: f(centro[0] - dLat), west: f(centro[1] - dLon) }
}

/** Raggio della tappa: quello della tappa, poi quello degli alloggi, poi RAGGIO_KM. */
export const raggioDi = (alloggi, tappa) => tappa.raggioKm ?? alloggi.raggioKm ?? RAGGIO_KM

const RADICE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const r2 = (n) => Math.round(n * 100) / 100
const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null)

/** Tappe con check-in da oggi in poi. */
export function tappe(alloggi, oggi = '') {
  return alloggi.tappe.filter((t) => !oggi || t.dal >= oggi)
}

/** Viaggi con alloggi.attivo === true e almeno una tappa futura. */
export function attivi(viaggi, oggi) {
  return viaggi.filter((v) => v.alloggi?.attivo === true && tappe(v.alloggi, oggi).length > 0)
}

const fontiDi = (alloggi) => alloggi.fonti ?? FONTI

/** Ricerche per esecuzione (tappe future × fonti) e stima mensile. */
export function stimaBudget(trips, oggi = '') {
  const perEsecuzione = trips.reduce((n, v) => n + tappe(v.alloggi, oggi).length * fontiDi(v.alloggi).length, 0)
  const alMese = perEsecuzione * ESECUZIONI_MESE
  const livello = alMese > LIMITE_MESE ? 'errore' : alMese > SOGLIA_AVVISO ? 'avviso' : 'ok'
  return { perEsecuzione, alMese, livello }
}

/**
 * Parametri SerpApi per una fonte e una tappa.
 * Airbnb filtra lato API (casa intera, camere e bagni minimi).
 * Booking non ha filtri su camere e bagni: si chiede un'unica unità per tutti
 * (rooms=1) tra i tipi di `alloggi.tipi` (default appartamenti e case vacanza, 201 e 220) e si filtra dopo.
 */
export function parametri(fonte, alloggi, tappa, extra = {}) {
  const comuni = { q: tappa.q, check_in_date: tappa.dal, check_out_date: tappa.al, adults: String(alloggi.adulti), currency: VALUTA }
  let p
  if (fonte === 'airbnb') {
    p = new URLSearchParams({
      engine: 'airbnb', ...comuni, bedrooms: String(alloggi.camere), bathrooms: String(alloggi.bagni), room_type: 'entire_home',
    })
    // Riquadro attorno al centro della tappa (nord,est,sud,ovest), insieme a q.
    if (Array.isArray(tappa.centro)) {
      const r = riquadro(tappa.centro, raggioDi(alloggi, tappa))
      p.set('map_bounds', [r.north, r.east, r.south, r.west].join(','))
    }
  } else if (fonte === 'booking') {
    p = new URLSearchParams({ engine: 'booking', ...comuni, rooms: '1', property_types: (alloggi.tipi ?? TIPI_BOOKING).join(',') })
  } else {
    throw new ErroreFatale('fonte sconosciuta: ' + fonte)
  }
  for (const [k, v] of Object.entries(extra)) if (v != null) p.set(k, String(v))
  return p
}

const risultati = (json) => (Array.isArray(json?.organic_results) ? json.organic_results : Array.isArray(json?.properties) ? json.properties : [])
const https = (u) => (typeof u === 'string' && /^https:\/\//i.test(u) ? u : '')
// Somma su rooms[], pesata per `quantity` (Booking può proporre più unità uguali).
const somma = (arr, k) => {
  const v = arr.filter((x) => num(x?.[k]) != null).map((x) => x[k] * (num(x.quantity) ?? 1))
  return v.length ? v.reduce((a, b) => a + b, 0) : null
}
// Valuta solo se è un codice ISO a tre lettere, altrimenti quella chiesta (la valuta del viaggio).
const valutaIso = (c, fb = VALUTA) => (typeof c === 'string' && /^[A-Z]{3}$/.test(c) ? c : fb)
/** Codice paese dal link Booking (…/hotel/us/…), o '' se manca. */
export const paeseBooking = (u) => /\/hotel\/([a-z]{2})\//.exec(u || '')?.[1] ?? ''
/** true se il prezzo Airbnb è a notte ("per night", "/ night") e non per il soggiorno. */
export const aNotte = (q) => typeof q === 'string' && /\bnight\b/i.test(q) && !/for \d+ nights/i.test(q) && !/total/i.test(q)

/**
 * Strutture normalizzate e filtrate (case con almeno `camere` camere e `bagni` bagni).
 * Airbnb: se camere/bagni mancano si tiene (il filtro è già lato API), se sono sotto si scarta.
 * Booking: camere e bagni dalla somma di rooms[]; se mancano si scarta. Con `monolocali` e `camere` ≤ 1
 * basta un'unità per due: monolocali (0 camere) e camere d'albergo, B&B o lodge che non dichiarano
 * camere o bagni non si scartano; si scarta solo chi ne dichiara meno del minimo.
 * `valuta`: quella del viaggio, per Airbnb e per le strutture Booking senza `currency` valida.
 * Con `centro` ([lat, lon]) e `raggioKm`: distanza da gps_coordinates, scartate le strutture più
 * lontane; per Booking (che le coordinate le dà sempre) anche quelle senza coordinate.
 * `stat`, se passato, conta { lontani, senzaCoordinate }.
 */
export function strutture(fonte, json, { notti, camere, bagni, paese, centro, raggioKm = RAGGIO_KM, stat, valuta = VALUTA, monolocali = false }) {
  const out = []
  for (const o of risultati(json)) {
    let totale = num(o?.extracted_price)
    if (totale == null) continue
    let s
    if (fonte === 'airbnb') {
      if (aNotte(o.price_qualifier)) {
        if (!notti) continue
        totale = r2(totale * notti)
      }
      s = {
        nome: o.name || o.title || '',
        tipo: o.title || '',
        totale,
        a_notte: notti ? r2(totale / notti) : '',
        tasse: '',
        valuta,
        camere: num(o.bedrooms),
        bagni: num(o.bathrooms),
        letti: num(o.beds),
        ospiti: '',
        valutazione: num(o.rating),
        scala: 5,
        recensioni: num(o.reviews),
        info: [o.price_qualifier, o.description].filter(Boolean).join(' · '),
        link: https(o.link),
        id: o.listing_id ?? '',
      }
      if ((s.camere != null && s.camere < camere) || (s.bagni != null && s.bagni < bagni)) continue
    } else {
      const rooms = Array.isArray(o.rooms) ? o.rooms : []
      s = {
        nome: o.name || '',
        tipo: rooms[0]?.type || o.type || '',
        totale,
        a_notte: num(o.extracted_price_per_night) ?? (notti ? r2(totale / notti) : ''),
        tasse: num(o.extracted_taxes_and_fees),
        valuta: valutaIso(o.currency, valuta),
        camere: somma(rooms, 'bedrooms'),
        bagni: somma(rooms, 'bathrooms'),
        letti: somma(rooms, 'beds'),
        ospiti: '',
        valutazione: num(o.rating),
        scala: 10,
        recensioni: num(o.reviews),
        info: [o.rating_text, o.availability].filter(Boolean).join(' · '),
        link: https(o.link),
        id: o.property_id ?? '',
      }
      if (monolocali && camere <= 1) {
        // Unità per due: va bene anche senza camere dichiarate (camera d'albergo) o con 0 (monolocale).
        if (s.bagni != null && s.bagni < bagni) continue
      } else if (s.camere == null || s.bagni == null || s.camere < camere || s.bagni < bagni) continue
      // Booking a volte risolve il luogo in un altro paese (Gardiner, MT → Gardiner, NZ): il paese è nel link.
      if (paese && paeseBooking(o.link) !== paese) continue
    }
    const lat = num(o.gps_coordinates?.latitude)
    const lon = num(o.gps_coordinates?.longitude)
    s.lat = lat ?? ''
    s.lon = lon ?? ''
    s.distanza_km = ''
    if (Array.isArray(centro)) {
      if (lat == null || lon == null) {
        // Senza coordinate non si può verificare la distanza (e la pagina non le mostrerebbe): si scarta.
        if (stat) stat.senzaCoordinate = (stat.senzaCoordinate || 0) + 1
        continue
      } else {
        const d = distanzaKm(centro, [lat, lon])
        if (d > raggioKm) {
          if (stat) stat.lontani = (stat.lontani || 0) + 1
          continue
        }
        s.distanza_km = Math.round(d * 10) / 10
      }
    }
    out.push(s)
  }
  return out.map((s, i) => ({ ...s, rango: i + 1 }))
}

/** Righe CSV per le strutture di una ricerca. */
export function righe({ run, fonte, tappa, alloggi, strutture: lista }) {
  const n = nottiTra(tappa.dal, tappa.al)
  return lista.map((s) => [
    run, fonte, tappa.id, tappa.nome, tappa.dal, tappa.al, n, alloggi.adulti, alloggi.camere, alloggi.bagni,
    s.rango, s.nome, s.tipo, s.totale, s.a_notte, s.tasse, s.valuta, s.camere, s.bagni, s.letti, s.ospiti,
    s.valutazione, s.scala, s.recensioni, s.info, s.link, s.id, s.lat, s.lon, s.distanza_km,
  ])
}

/** Ricerca SerpApi per gli alloggi ("vuota" = errore senza risultati). */
export function cerca(params, opts = {}) {
  return cercaSerpApi(params, { ...opts, conta: (json) => risultati(json).length })
}

/**
 * fetch finto: airbnb.json o booking.json secondo l'engine; scenari vuoto/chiave.
 * Le fixture sono costruite attorno a `search_metadata.centro_fixture`: le coordinate vengono
 * spostate sul centro della tappa cercata (da `q`), così il filtro per distanza vale per ogni tappa.
 */
export function fetchFixture(dir, scenario = '', viaggi = VIAGGI) {
  const leggi = (nome) => JSON.parse(readFileSync(path.join(dir, nome + '.json'), 'utf8'))
  const centri = new Map(viaggi.flatMap((v) => (v.alloggi?.tappe ?? []).filter((t) => t.centro).map((t) => [t.q, t.centro])))
  const sposta = (json, centro) => {
    const rif = json?.search_metadata?.centro_fixture
    if (!rif || !centro) return json
    for (const o of risultati(json)) {
      const g = o.gps_coordinates
      if (g && typeof g.latitude === 'number') o.gps_coordinates = { latitude: g.latitude + centro[0] - rif[0], longitude: g.longitude + centro[1] - rif[1] }
    }
    return json
  }
  return async (url) => {
    const sp = new URL(url).searchParams
    let nome = sp.get('engine')
    let status = 200
    if (scenario === 'vuoto') nome = 'vuoto'
    if (scenario === 'chiave') {
      nome = 'chiave'
      status = 401
    }
    const corpo = sposta(leggi(nome), centri.get(sp.get('q')))
    return { ok: status < 400, status, json: async () => corpo }
  }
}

export function scriviCsv(file, rows) {
  scriviCsvComune(file, HEADER, rows, [HEADER_V1])
}

/**
 * Viaggi da cercare. Senza slug: quelli attivi con tappe future. Con slug: quel viaggio
 * anche se `attivo: false` (rilevazione una tantum), purché abbia gli alloggi e una tappa futura.
 */
export function selezione(viaggi, oggi, slug, log = logConsole) {
  if (slug) {
    const v = viaggi.find((x) => x.slug === slug)
    if (!v) {
      log.info(slug + ': nessun viaggio con questo slug')
      return []
    }
    if (!v.alloggi) {
      log.info(slug + ': il viaggio non ha alloggi da cercare')
      return []
    }
    if (!tappe(v.alloggi, oggi).length) {
      log.info(slug + ': tappe già passate, salto')
      return []
    }
    if (v.alloggi.attivo !== true) log.info(slug + ': non attivo, cercato una volta perché richiesto con --slug')
    return [v]
  }
  for (const v of viaggi) {
    if (v.alloggi?.attivo === true && !tappe(v.alloggi, oggi).length) log.info(v.slug + ': tappe già passate, salto')
  }
  return attivi(viaggi, oggi)
}

function controllaBudget(trips, oggi, log) {
  // Solo viaggi non attivi (scelti con --slug): una rilevazione una tantum, il limite vale per
  // questa esecuzione e non per 16 esecuzioni al mese.
  if (trips.length && trips.every((v) => v.alloggi?.attivo !== true)) {
    const n = stimaBudget(trips, oggi).perEsecuzione
    const u = { perEsecuzione: n, alMese: n, livello: n > LIMITE_MESE ? 'errore' : n > SOGLIA_AVVISO ? 'avviso' : 'ok' }
    const msg = 'Esecuzione una tantum alloggi: ' + n + ' ricerche (fuori dal budget mensile dei viaggi attivi, limite ' + LIMITE_MESE + ')'
    if (u.livello === 'errore') log.error(msg + ': troppe, riduci tappe o fonti')
    else if (u.livello === 'avviso') log.warn(msg + ': vicino al limite')
    else log.info(msg)
    return u
  }
  const b = stimaBudget(trips, oggi)
  const msg =
    'Budget SerpApi alloggi: ' + b.perEsecuzione + ' ricerche per esecuzione, circa ' + b.alMese +
    ' al mese (' + ESECUZIONI_MESE + ' esecuzioni, limite ' + LIMITE_MESE + ')'
  if (b.livello === 'errore') log.error(msg + ': troppe, riduci tappe, fonti o viaggi attivi')
  else if (b.livello === 'avviso') log.warn(msg + ': vicino al limite')
  else log.info(msg)
  return b
}

async function cercaViaggio(v, run, { apiKey, fetchImpl, ritardoRetry, log }) {
  const al = v.alloggi
  const lista = tappe(al, run.slice(0, 10))
  const fonti = fontiDi(al)
  const valuta = valutaDi(v)
  const rows = []
  let fallite = 0
  let trovate = 0
  for (const t of lista) {
    let perTappa = 0
    for (const fonte of fonti) {
      const r = await cerca(parametri(fonte, al, t, { api_key: apiKey, currency: valuta }), { fetchImpl, ritardoRetry })
      if (r.stato === 'fallito') {
        fallite++
        log.warn(v.slug + ' ' + t.id + ' ' + fonte + ': ricerca fallita (' + r.motivo + ')')
        continue
      }
      if (r.stato === 'vuoto') log.warn(v.slug + ' ' + t.id + ' ' + fonte + ': nessun risultato (' + r.motivo + ')')
      const stat = { lontani: 0, senzaCoordinate: 0 }
      const raggio = raggioDi(al, t)
      const s = strutture(fonte, r.json, {
        notti: nottiTra(t.dal, t.al), camere: al.camere, bagni: al.bagni, paese: al.paese, centro: t.centro, raggioKm: raggio, stat,
        valuta, monolocali: al.monolocali === true,
      })
      const grezzi = risultati(r.json).length
      log.info(v.slug + ' ' + t.id + ' ' + fonte + ': ' + s.length + ' case adatte su ' + grezzi)
      if (stat.lontani || stat.senzaCoordinate) {
        log.warn(
          v.slug + ' ' + t.id + ' ' + fonte + ': scartate ' + stat.lontani + ' oltre ' + raggio + ' km dal centro' +
            (stat.senzaCoordinate ? ' e ' + stat.senzaCoordinate + ' senza coordinate' : ''),
        )
      }
      if (grezzi > 0 && s.length === 0) {
        log.warn(v.slug + ' ' + t.id + ' ' + fonte + ': ' + grezzi + ' risultati ma nessuno con ' + al.camere + ' camere e ' + al.bagni + ' bagni (o senza dati): tutti scartati')
      }
      perTappa += s.length
      rows.push(...righe({ run, fonte, tappa: t, alloggi: al, strutture: s }))
    }
    if (!perTappa) log.warn(v.slug + ' ' + t.id + ': nessuna casa con ' + al.camere + ' camere e ' + al.bagni + ' bagni')
    trovate += perTappa
  }
  const ricerche = lista.length * fonti.length
  if (fallite > ricerche / 2 || trovate === 0) {
    return { errore: v.slug + ': ' + fallite + ' ricerche fallite su ' + ricerche + ', ' + trovate + ' case: non aggiorno il CSV' }
  }
  return { rows }
}

/** Esecuzione completa. Ritorna il codice di uscita (0 ok, 1 errore). */
export async function esegui({
  viaggi = VIAGGI,
  now,
  apiKey,
  fetchImpl = fetch,
  outDir = path.join(RADICE, 'public'),
  slug = '',
  dryRun = false,
  ritardoRetry = RITARDO_RETRY_MS,
  log = logConsole,
} = {}) {
  try {
    const run = adesso(now, 'ALLOGGI_NOW')
    const oggi = run.slice(0, 10)
    const trips = selezione(viaggi, oggi, slug, log)
    if (!trips.length) {
      log.info((slug ? 'Nessun viaggio da cercare con slug ' + slug : 'Nessun viaggio con alloggi attivi') + ': niente da cercare.')
      return slug ? 1 : 0
    }

    if (dryRun) {
      for (const v of trips) {
        const al = v.alloggi
        const lista = tappe(al, oggi)
        log.info(
          v.slug + ': ' + al.adulti + ' adulti, almeno ' + al.camere + ' camere' + (al.monolocali ? ' (o monolocale)' : '') + ' e ' + al.bagni + ' bagni, ' + lista.length +
            ' tappe × ' + fontiDi(al).length + ' fonti (' + fontiDi(al).join(', ') + ') = ' + lista.length * fontiDi(al).length + ' ricerche',
        )
        for (const t of lista) {
          log.info(
            '  ' + t.id + ': ' + t.q + ', ' + t.dal + ' → ' + t.al + ' (' + nottiTra(t.dal, t.al) + ' notti' +
              (t.centro ? ', entro ' + raggioDi(al, t) + ' km dal centro' : '') + ')',
          )
        }
      }
      return controllaBudget(trips, oggi, log).livello === 'errore' ? 1 : 0
    }

    if (!apiKey) throw new ErroreFatale('SERPAPI_KEY_ALLOGGI mancante')
    if (controllaBudget(trips, oggi, log).livello === 'errore') return 1

    let codice = 0
    for (const v of trips) {
      const esito = await cercaViaggio(v, run, { apiKey, fetchImpl, ritardoRetry, log })
      if (esito.errore) {
        log.error(esito.errore)
        codice = 1
        continue
      }
      const file = path.join(outDir, v.slug, 'alloggi.csv')
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
  const a = { dryRun: false, slug: '', fixture: '', scenario: '', out: '' }
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i]
    if (k === '--dry-run') a.dryRun = true
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
  const opts = { now: process.env.ALLOGGI_NOW || undefined, slug: a.slug, dryRun: a.dryRun }
  if (a.out) opts.outDir = path.resolve(a.out)
  if (a.fixture) {
    opts.fetchImpl = fetchFixture(path.resolve(a.fixture), a.scenario)
    opts.apiKey = 'fixture'
    opts.ritardoRetry = 0
  } else {
    opts.apiKey = process.env.SERPAPI_KEY_ALLOGGI
  }
  process.exitCode = await esegui(opts)
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main()
}
