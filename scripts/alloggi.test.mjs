import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { viaggi } from '../src/viaggi.js'
import { HEADER, aNotte, attivi, esegui, fetchFixture, parametri, stimaBudget, strutture, tappe } from './alloggi.mjs'
import { parseCSV } from './serpapi.mjs'
import { stimaBudget as stimaVoli } from './voli.mjs'

const QUI = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE = path.join(QUI, 'fixtures', 'alloggi')
const json = (nome) => JSON.parse(readFileSync(path.join(FIXTURE, nome + '.json'), 'utf8'))
const ovest = viaggi.find((v) => v.slug === 'ovest-2027')
const al = ovest.alloggi
const jackson = al.tappe.find((t) => t.id === 'jackson')
const silenzio = () => {
  const msgs = { info: [], warn: [], error: [] }
  return { msgs, info: (m) => msgs.info.push(m), warn: (m) => msgs.warn.push(m), error: (m) => msgs.error.push(m) }
}
const minimi = { notti: 3, camere: 3, bagni: 2 }

describe('configurazione e budget', () => {
  test('parametri per fonte', () => {
    const a = parametri('airbnb', al, jackson, { api_key: 'k' })
    assert.deepEqual(Object.fromEntries(a), {
      engine: 'airbnb', q: 'Jackson, WY', check_in_date: '2027-07-21', check_out_date: '2027-07-24', adults: '6',
      currency: 'EUR', bedrooms: '3', bathrooms: '2', room_type: 'entire_home', api_key: 'k',
    })
    const b = parametri('booking', al, jackson)
    assert.deepEqual(Object.fromEntries(b), {
      engine: 'booking', q: 'Jackson, WY', check_in_date: '2027-07-21', check_out_date: '2027-07-24', adults: '6',
      currency: 'EUR', rooms: '1', property_types: '201,220',
    })
    assert.equal(b.has('no_cache'), false)
    assert.throws(() => parametri('expedia', al, jackson), /fonte sconosciuta/)
  })

  test('tappe future e viaggi attivi', () => {
    assert.equal(tappe(al, '2026-10-28').length, 6)
    assert.deepEqual(tappe(al, '2027-07-24').map((t) => t.id), ['west-yellowstone', 'gardiner', 'bozeman'])
    assert.deepEqual(attivi(viaggi, '2027-07-31').map((v) => v.slug), [])
    assert.deepEqual(attivi([{ slug: 'x', alloggi: { ...al, attivo: false } }, ovest], '2026-10-28').map((v) => v.slug), ['ovest-2027'])
  })

  test('budget 12 per esecuzione e 192 al mese, separato da quello dei voli', () => {
    assert.deepEqual(stimaBudget([ovest], '2026-10-28'), { perEsecuzione: 12, alMese: 192, livello: 'ok' })
    assert.deepEqual(stimaBudget([ovest], '2027-07-24'), { perEsecuzione: 6, alMese: 96, livello: 'ok' })
    assert.equal(stimaBudget([ovest, ovest], '2026-10-28').livello, 'errore')
    assert.equal(stimaVoli([ovest], '2026-10-28').perEsecuzione, 12)
  })
})

describe('normalizzazione', () => {
  test('Airbnb: totale del soggiorno, media a notte, scarta sotto i minimi e senza prezzo', () => {
    const s = strutture('airbnb', json('airbnb'), minimi)
    assert.deepEqual(s.map((x) => x.nome), ['Cabin with Teton views, hot tub', 'Downtown townhouse, walk to the square', 'New listing near Snake River'])
    assert.deepEqual(s[0], {
      nome: 'Cabin with Teton views, hot tub', tipo: 'Home in Jackson', totale: 2340, a_notte: 780, tasse: '', valuta: 'EUR',
      camere: 3, bagni: 2, letti: 5, ospiti: '', valutazione: 4.92, scala: 5, recensioni: 87,
      info: 'for 3 nights · Log cabin near the town square, with a hot tub and a deck',
      link: 'https://www.airbnb.com/rooms/51234567890123456?check_in=2027-07-21&check_out=2027-07-24&adults=6',
      id: '51234567890123456', rango: 1,
    })
    assert.equal(s[1].bagni, 2.5)
    assert.equal(s[2].camere, null) // campi assenti: tenuta, il filtro è lato API
    assert.deepEqual(s.map((x) => x.rango), [1, 2, 3])
  })

  test('Booking: camere e bagni da rooms[], filtro a valle, link solo https', () => {
    const s = strutture('booking', json('booking'), minimi)
    assert.deepEqual(s.map((x) => x.nome), ['Elk Run, "The Lodge" Townhome', 'Wilson Creek House, with deck'])
    assert.deepEqual(s[0], {
      nome: 'Elk Run, "The Lodge" Townhome', tipo: 'Entire home', totale: 2190, a_notte: 730, tasse: 205, valuta: 'EUR',
      camere: 3, bagni: 2, letti: 5, ospiti: '', valutazione: 8.9, scala: 10, recensioni: 214,
      info: 'Fabulous · Only 1 left at this price on our site',
      link: 'https://www.booking.com/hotel/us/elk-run-the-lodge.html?checkin=2027-07-21&checkout=2027-07-24&group_adults=6',
      id: 9123456, rango: 1,
    })
    assert.equal(s[1].link, '')
    assert.equal(s[1].a_notte, 826.67)
    assert.deepEqual(strutture('booking', json('vuoto'), minimi), [])
  })
})

describe('casi particolari', () => {
  test('Booking: rooms[] pesate per quantity', () => {
    const j = { properties: [
      { name: 'Due appartamenti uguali', extracted_price: 1800, currency: 'EUR', rooms: [{ type: 'Entire apartment', bedrooms: 2, bathrooms: 1, beds: 3, quantity: 2 }] },
      { name: 'Uno solo', extracted_price: 900, rooms: [{ bedrooms: 2, bathrooms: 1, quantity: 1 }] },
    ] }
    const s = strutture('booking', j, minimi)
    assert.deepEqual(s.map((x) => [x.nome, x.camere, x.bagni, x.letti]), [['Due appartamenti uguali', 4, 2, 6]])
  })

  test('Airbnb: prezzo a notte moltiplicato per le notti, «for N nights» e «total» lasciati', () => {
    assert.equal(aNotte('per night'), true)
    assert.equal(aNotte('/ night'), true)
    assert.equal(aNotte('for 3 nights'), false)
    assert.equal(aNotte('total'), false)
    assert.equal(aNotte('night total'), false)
    assert.equal(aNotte(undefined), false)
    const j = { organic_results: [
      { name: 'A notte', extracted_price: 700, price_qualifier: 'per night', bedrooms: 3, bathrooms: 2 },
      { name: 'Soggiorno', extracted_price: 2000, price_qualifier: 'for 3 nights', bedrooms: 3, bathrooms: 2 },
    ] }
    const s = strutture('airbnb', j, minimi)
    assert.deepEqual(s.map((x) => [x.totale, x.a_notte]), [[2100, 700], [2000, 666.67]])
  })

  test('valuta: solo codici ISO a tre lettere, altrimenti EUR', () => {
    const j = { properties: [
      { name: 'Ok', extracted_price: 1000, currency: 'USD', rooms: [{ bedrooms: 3, bathrooms: 2 }] },
      { name: 'Strana', extracted_price: 1000, currency: '$', rooms: [{ bedrooms: 3, bathrooms: 2 }] },
      { name: 'Html', extracted_price: 1000, currency: '<b>EUR</b>', rooms: [{ bedrooms: 3, bathrooms: 2 }] },
    ] }
    assert.deepEqual(strutture('booking', j, minimi).map((x) => x.valuta), ['USD', 'EUR', 'EUR'])
  })
})

describe('esecuzione completa con fixture', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'alloggi-'))
  after(() => rmSync(dir, { recursive: true, force: true }))
  const base = { viaggi: [ovest], apiKey: 'fixture', fetchImpl: fetchFixture(FIXTURE), ritardoRetry: 0 }
  const col = (r, k) => r[HEADER.indexOf(k)]

  test('prima esecuzione crea, la seconda accoda; quoting corretto', async () => {
    const csv = path.join(dir, 'ovest-2027', 'alloggi.csv')
    assert.equal(await esegui({ ...base, outDir: dir, now: '2026-10-28T05:17:00Z', log: silenzio() }), 0)
    const r1 = parseCSV(readFileSync(csv, 'utf8'))
    assert.deepEqual(r1[0], HEADER)
    assert.equal(r1.length, 1 + 6 * (3 + 2))
    const d = r1.slice(1).filter((r) => col(r, 'tappa') === 'denver')
    assert.deepEqual(d.map((r) => col(r, 'fonte')), ['airbnb', 'airbnb', 'airbnb', 'booking', 'booking'])
    assert.equal(col(d[0], 'notti'), '1')
    assert.equal(col(d[0], 'a_notte'), '2340')
    assert.equal(col(d[3], 'nome'), 'Elk Run, "The Lodge" Townhome')
    assert.equal(col(d[3], 'scala'), '10')
    assert.equal(col(d[0], 'luogo'), 'Denver')
    assert.equal(await esegui({ ...base, outDir: dir, now: '2026-10-30T05:17:00Z', log: silenzio() }), 0)
    assert.equal(parseCSV(readFileSync(csv, 'utf8')).length, 1 + 2 * 30)
    assert.equal(existsSync(csv + '.tmp'), false)
  })

  test('intestazione diversa: errore e file invariato', async () => {
    const d = mkdtempSync(path.join(dir, 'h-'))
    const f = path.join(d, 'ovest-2027', 'alloggi.csv')
    mkdirSync(path.dirname(f), { recursive: true })
    writeFileSync(f, 'run,altro\n1,2\n')
    const log = silenzio()
    assert.equal(await esegui({ ...base, outDir: d, now: '2026-10-28T05:17:00Z', log }), 1)
    assert.equal(readFileSync(f, 'utf8'), 'run,altro\n1,2\n')
    assert.match(log.msgs.error.join('\n'), /intestazione/)
  })

  test('chiave non valida: nessun file', async () => {
    const d = mkdtempSync(path.join(dir, 'k-'))
    const log = silenzio()
    assert.equal(await esegui({ ...base, fetchImpl: fetchFixture(FIXTURE, 'chiave'), outDir: d, now: '2026-10-28T05:17:00Z', log }), 1)
    assert.equal(existsSync(path.join(d, 'ovest-2027')), false)
    assert.match(log.msgs.error.join('\n'), /chiave/)
  })

  test('nessun risultato ovunque: errore e nessuna scrittura', async () => {
    const d = mkdtempSync(path.join(dir, 'v-'))
    const log = silenzio()
    assert.equal(await esegui({ ...base, fetchImpl: fetchFixture(FIXTURE, 'vuoto'), outDir: d, now: '2026-10-28T05:17:00Z', log }), 1)
    assert.equal(existsSync(path.join(d, 'ovest-2027')), false)
  })

  test('una tappa vuota: le altre si scrivono, con un avviso', async () => {
    const d = mkdtempSync(path.join(dir, 't-'))
    const f0 = fetchFixture(FIXTURE)
    const vuoto = json('vuoto')
    const fetchImpl = async (url) =>
      new URL(url).searchParams.get('q') === 'Gardiner, MT' ? { ok: true, status: 200, json: async () => vuoto } : f0(url)
    const log = silenzio()
    assert.equal(await esegui({ ...base, fetchImpl, outDir: d, now: '2026-10-28T05:17:00Z', log }), 0)
    const r = parseCSV(readFileSync(path.join(d, 'ovest-2027', 'alloggi.csv'), 'utf8')).slice(1)
    assert.equal(r.length, 5 * 5)
    assert.equal(r.some((x) => col(x, 'tappa') === 'gardiner'), false)
    assert.match(log.msgs.warn.join('\n'), /gardiner: nessuna casa/)
  })

  test('risultati tutti scartati dal filtro: avviso visibile', async () => {
    const d = mkdtempSync(path.join(dir, 's-'))
    const f0 = fetchFixture(FIXTURE)
    const piccole = { properties: [{ name: 'Studio', extracted_price: 500, rooms: [{ bedrooms: 1, bathrooms: 1 }] }] }
    const fetchImpl = async (url) =>
      new URL(url).searchParams.get('engine') === 'booking' ? { ok: true, status: 200, json: async () => piccole } : f0(url)
    const log = silenzio()
    assert.equal(await esegui({ ...base, fetchImpl, outDir: d, now: '2026-10-28T05:17:00Z', log }), 0)
    assert.equal(log.msgs.warn.filter((m) => /booking: 1 risultati ma nessuno/.test(m)).length, 6)
  })

  test('chiave mancante', async () => {
    const log = silenzio()
    assert.equal(await esegui({ ...base, apiKey: undefined, outDir: dir, now: '2026-10-28T05:17:00Z', log }), 1)
    assert.match(log.msgs.error.join('\n'), /SERPAPI_KEY_ALLOGGI mancante/)
  })

  test('CLI --dry-run: 12 ricerche per esecuzione, 192 al mese', () => {
    const r = spawnSync(process.execPath, [path.join(QUI, 'alloggi.mjs'), '--dry-run'], {
      encoding: 'utf8',
      env: { ...process.env, SERPAPI_KEY_ALLOGGI: '', ALLOGGI_NOW: '2026-10-28T05:17:00Z' },
    })
    assert.equal(r.status, 0, r.stderr)
    assert.match(r.stdout, /12 ricerche per esecuzione, circa 192 al mese/)
  })
})
