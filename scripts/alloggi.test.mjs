import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { viaggi } from '../src/viaggi.js'
import { HEADER, HEADER_V1, aNotte, paeseBooking, attivi, distanzaKm, esegui, raggioDi, riquadro, fetchFixture, parametri, stimaBudget, strutture, tappe } from './alloggi.mjs'
import { csvRiga, parseCSV } from './serpapi.mjs'
import { stimaBudget as stimaVoli } from './voli.mjs'

const QUI = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE = path.join(QUI, 'fixtures', 'alloggi')
const json = (nome) => JSON.parse(readFileSync(path.join(FIXTURE, nome + '.json'), 'utf8'))
// Il viaggio lungo è disattivato dal 2026-10-29: nei test resta la copia riattivata.
const lungo = viaggi.find((v) => v.slug === 'ovest-2027')
const ovest = { ...lungo, voli: { ...lungo.voli, attivo: true }, alloggi: { ...lungo.alloggi, attivo: true } }
const breve = viaggi.find((v) => v.slug === 'ovest-2027-short')
const al = ovest.alloggi
const jackson = al.tappe.find((t) => t.id === 'jackson')
const silenzio = () => {
  const msgs = { info: [], warn: [], error: [] }
  return { msgs, info: (m) => msgs.info.push(m), warn: (m) => msgs.warn.push(m), error: (m) => msgs.error.push(m) }
}
const minimi = { notti: 3, camere: 3, bagni: 2 }
const vicino = { ...minimi, centro: [43.4799, -110.7624], raggioKm: 25 }

describe('configurazione e budget', () => {
  test('parametri per fonte', () => {
    const a = parametri('airbnb', al, jackson, { api_key: 'k' })
    assert.deepEqual(Object.fromEntries(a), {
      engine: 'airbnb', q: 'Jackson, Wyoming, USA', check_in_date: '2027-07-19', check_out_date: '2027-07-22', adults: '6',
      currency: 'EUR', bedrooms: '3', bathrooms: '2', room_type: 'entire_home', api_key: 'k',
      map_bounds: '43.7045,-110.4529,43.2553,-111.0719',
    })
    const b = parametri('booking', al, jackson)
    assert.deepEqual(Object.fromEntries(b), {
      engine: 'booking', q: 'Jackson, Wyoming, USA', check_in_date: '2027-07-19', check_out_date: '2027-07-22', adults: '6',
      currency: 'EUR', rooms: '1', property_types: '201,220',
    })
    assert.equal(b.has('no_cache'), false)
    assert.throws(() => parametri('expedia', al, jackson), /fonte sconosciuta/)
  })

  test('tappe future e viaggi attivi', () => {
    assert.equal(tappe(al, '2026-10-28').length, 6)
    assert.deepEqual(tappe(al, '2027-07-22').map((t) => t.id), ['west-yellowstone', 'gardiner', 'bozeman'])
    assert.deepEqual(attivi(viaggi, '2027-07-29').map((v) => v.slug), [])
    assert.deepEqual(attivi([{ slug: 'x', alloggi: { ...al, attivo: false } }, ovest], '2026-10-28').map((v) => v.slug), ['ovest-2027'])
  })

  test('budget 12 per esecuzione e 192 al mese, separato da quello dei voli', () => {
    assert.deepEqual(stimaBudget([ovest], '2026-10-28'), { perEsecuzione: 12, alMese: 192, livello: 'ok' })
    assert.deepEqual(stimaBudget([ovest], '2027-07-22'), { perEsecuzione: 6, alMese: 96, livello: 'ok' })
    assert.equal(stimaBudget([ovest, ovest], '2026-10-28').livello, 'errore')
    assert.equal(stimaVoli([ovest], '2026-10-28').perEsecuzione, 10)
  })

  test('viaggio breve: unico attivo, 4 tappe consecutive, 8 ricerche per esecuzione e 128 al mese', () => {
    assert.deepEqual(attivi(viaggi, '2026-10-29').map((v) => v.slug), ['ovest-2027-short'])
    assert.equal(lungo.alloggi.attivo, false)
    assert.deepEqual(tappe(breve.alloggi, '2026-10-29').map((t) => [t.id, t.dal, t.al]), [
      ['jackson', '2027-07-20', '2027-07-23'],
      ['west-yellowstone', '2027-07-23', '2027-07-26'],
      ['gardiner', '2027-07-26', '2027-07-28'],
      ['bozeman', '2027-07-28', '2027-07-29'],
    ])
    assert.deepEqual(stimaBudget([breve], '2026-10-29'), { perEsecuzione: 8, alMese: 128, livello: 'ok' })
    assert.equal(stimaVoli([breve], '2026-10-29').perEsecuzione, 13)
  })
})

describe('normalizzazione', () => {
  test('Airbnb: totale del soggiorno, media a notte, scarta sotto i minimi e senza prezzo', () => {
    const stat = {}
    const s = strutture('airbnb', json('airbnb'), { ...vicino, stat })
    assert.deepEqual(s.map((x) => x.nome), ['Cabin with Teton views, hot tub', 'Downtown townhouse, walk to the square', 'New listing near Snake River'])
    assert.deepEqual(stat, { lontani: 1 }) // la fattoria in Idaho, a ~39 km
    assert.deepEqual(s[0], {
      nome: 'Cabin with Teton views, hot tub', tipo: 'Home in Jackson', totale: 2340, a_notte: 780, tasse: '', valuta: 'EUR',
      camere: 3, bagni: 2, letti: 5, ospiti: '', valutazione: 4.92, scala: 5, recensioni: 87,
      info: 'for 3 nights · Log cabin near the town square, with a hot tub and a deck',
      link: 'https://www.airbnb.com/rooms/51234567890123456?check_in=2027-07-21&check_out=2027-07-24&adults=6',
      id: '51234567890123456', lat: 43.481, lon: -110.76, distanza_km: 0.2, rango: 1,
    })
    assert.equal(s[1].bagni, 2.5)
    assert.equal(s[2].camere, null) // campi assenti: tenuta, il filtro è lato API
    assert.deepEqual(s.map((x) => x.rango), [1, 2, 3])
  })

  test('Booking: camere e bagni da rooms[], filtro a valle, link solo https', () => {
    const stat = {}
    const s = strutture('booking', json('booking'), { ...vicino, stat })
    assert.deepEqual(s.map((x) => x.nome), ['Elk Run, "The Lodge" Townhome', 'Wilson Creek House, with deck'])
    assert.deepEqual(stat, { senzaCoordinate: 1, lontani: 1 })
    assert.deepEqual(s[0], {
      nome: 'Elk Run, "The Lodge" Townhome', tipo: 'Entire home', totale: 2190, a_notte: 730, tasse: 205, valuta: 'EUR',
      camere: 3, bagni: 2, letti: 5, ospiti: '', valutazione: 8.9, scala: 10, recensioni: 214,
      info: 'Fabulous · Only 1 left at this price on our site',
      link: 'https://www.booking.com/hotel/us/elk-run-the-lodge.html?checkin=2027-07-21&checkout=2027-07-24&group_adults=6',
      id: 9123456, lat: 43.485, lon: -110.755, distanza_km: 0.8, rango: 1,
    })
    assert.equal(s[1].link, '')
    assert.equal(s[1].a_notte, 826.67)
    assert.deepEqual(strutture('booking', json('vuoto'), minimi), [])
  })
})

describe('distanza dal centro della tappa', () => {
  test('emisenoverso e riquadro', () => {
    assert.equal(Math.round(distanzaKm([43.4799, -110.7624], [43.723, -111.111])), 39)
    assert.equal(distanzaKm([45, -110], [45, -110]), 0)
    const r = riquadro([44.6621, -111.1041], 25)
    assert.ok(Math.abs(distanzaKm([44.6621, -111.1041], [r.north, -111.1041]) - 25) < 0.1)
    assert.ok(Math.abs(distanzaKm([44.6621, -111.1041], [44.6621, r.east]) - 25) < 0.2)
    assert.ok(r.north > r.south && r.east > r.west)
  })

  test('map_bounds solo per Airbnb e solo con il centro; raggio della tappa prima di quello generale', () => {
    const wy = al.tappe.find((t) => t.id === 'west-yellowstone')
    const mb = parametri('airbnb', al, wy).get('map_bounds').split(',').map(Number)
    assert.equal(mb.length, 4)
    assert.ok(mb[0] > wy.centro[0] && mb[2] < wy.centro[0] && mb[1] > wy.centro[1] && mb[3] < wy.centro[1])
    assert.equal(parametri('booking', al, wy).has('map_bounds'), false)
    assert.equal(parametri('airbnb', al, { ...wy, centro: undefined }).has('map_bounds'), false)
    assert.equal(raggioDi(al, wy), 25)
    assert.equal(raggioDi(al, { ...wy, raggioKm: 10 }), 10)
    assert.equal(raggioDi({}, wy), 25)
  })

  test('senza centro niente filtro per distanza; con centro, senza coordinate si scarta (Airbnb e Booking)', () => {
    assert.equal(strutture('airbnb', json('airbnb'), minimi).length, 4)
    const j = { organic_results: [{ name: 'Senza pin', extracted_price: 1000, bedrooms: 3, bathrooms: 2 }] }
    assert.equal(strutture('airbnb', j, vicino).length, 0)
    const k = { properties: [{ name: 'Senza pin', extracted_price: 1000, rooms: [{ bedrooms: 3, bathrooms: 2 }], link: 'https://www.booking.com/hotel/us/x.html' }] }
    assert.equal(strutture('booking', k, vicino).length, 0)
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

  test('Booking: scartati i risultati in un altro paese', () => {
    assert.equal(paeseBooking('https://www.booking.com/hotel/nz/casa-deco.html?checkin=2027-07-27'), 'nz')
    assert.equal(paeseBooking(''), '')
    const j = { properties: [
      { name: 'Montana', extracted_price: 1000, link: 'https://www.booking.com/hotel/us/a.html', rooms: [{ bedrooms: 3, bathrooms: 2 }] },
      { name: 'Nuova Zelanda', extracted_price: 400, link: 'https://www.booking.com/hotel/nz/b.html', rooms: [{ bedrooms: 3, bathrooms: 2 }] },
      { name: 'Senza link', extracted_price: 500, rooms: [{ bedrooms: 3, bathrooms: 2 }] },
    ] }
    assert.deepEqual(strutture('booking', j, { ...minimi, paese: 'us' }).map((x) => x.nome), ['Montana'])
    assert.equal(strutture('booking', j, minimi).length, 3)
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

  test('migrazione dal CSV senza coordinate: colonne lat, lon, distanza_km vuote, poi accoda', async () => {
    const d = mkdtempSync(path.join(dir, 'mg-'))
    const f = path.join(d, 'ovest-2027', 'alloggi.csv')
    mkdirSync(path.dirname(f), { recursive: true })
    const vecchia = ['2026-10-28T13:40:06Z', 'booking', 'gardiner', 'Gardiner', '2027-07-27', '2027-07-30', '3', '6', '3', '2', '1',
      'Casa, con "portico"', 'Entire home', '2500', '833.33', '', 'EUR', '3', '2', '5', '', '9.1', '10', '20', 'Superb',
      'https://www.booking.com/hotel/us/x.html', '123']
    writeFileSync(f, HEADER_V1.join(',') + '\n' + csvRiga(vecchia) + '\n')
    assert.equal(await esegui({ ...base, outDir: d, now: '2026-10-30T05:17:00Z', log: silenzio() }), 0)
    const r = parseCSV(readFileSync(f, 'utf8'))
    assert.deepEqual(r[0], HEADER)
    assert.deepEqual(r[1], [...vecchia, '', '', ''])
    assert.equal(r.length, 2 + 30)
    const dk = HEADER.indexOf('distanza_km')
    assert.ok(r.slice(2).every((x) => x[dk] === '' ? x[1] === 'airbnb' : Number(x[dk]) <= 25))
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
      new URL(url).searchParams.get('q') === 'Gardiner, Montana, USA' ? { ok: true, status: 200, json: async () => vuoto } : f0(url)
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

  test('CLI --dry-run: solo il viaggio breve, 8 ricerche per esecuzione, 128 al mese', () => {
    const r = spawnSync(process.execPath, [path.join(QUI, 'alloggi.mjs'), '--dry-run'], {
      encoding: 'utf8',
      env: { ...process.env, SERPAPI_KEY_ALLOGGI: '', ALLOGGI_NOW: '2026-10-29T05:17:00Z' },
    })
    assert.equal(r.status, 0, r.stderr)
    assert.match(r.stdout, /8 ricerche per esecuzione, circa 128 al mese/)
  })
})

describe('Big Island: viaggio non attivo, rilevazione una tantum con --slug', () => {
  const big = viaggi.find((v) => v.slug === 'big-island-2027')
  const dir = mkdtempSync(path.join(tmpdir(), 'alloggi-big-'))
  after(() => rmSync(dir, { recursive: true, force: true }))
  const base = { viaggi, apiKey: 'fixture', ritardoRetry: 0, now: '2026-10-29T05:17:00Z' }
  const col = (x, k) => x[HEADER.indexOf(k)]
  const cli = (...args) =>
    spawnSync(process.execPath, [path.join(QUI, 'alloggi.mjs'), '--dry-run', ...args], {
      encoding: 'utf8',
      env: { ...process.env, SERPAPI_KEY_ALLOGGI: '', ALLOGGI_NOW: '2026-10-29T05:17:00Z' },
    })

  test('spento, solo Booking, tre tappe consecutive di 4, 3 e 3 notti: 3 ricerche', () => {
    assert.equal(big.alloggi.attivo, false)
    assert.deepEqual(attivi(viaggi, '2026-10-29').map((v) => v.slug), ['ovest-2027-short'])
    assert.deepEqual(stimaBudget([big], '2026-10-29'), { perEsecuzione: 3, alMese: 48, livello: 'ok' })
    const t = big.alloggi.tappe
    assert.deepEqual(t.map((x) => x.id), ['kona', 'volcano', 'kohala'])
    for (let i = 1; i < t.length; i++) assert.equal(t[i].dal, t[i - 1].al)
    assert.equal(t[0].dal, '2027-02-17')
    assert.equal(t.at(-1).al, '2027-02-27')
    // la terza base è Waimea
    assert.equal(t[2].vicino, 'Waimea')
    assert.ok(distanzaKm(t[2].centro, [20.0234, -155.6717]) < 1)
  })

  test('CLI --dry-run senza slug: il viaggio non conta', () => {
    const r = cli()
    assert.equal(r.status, 0, r.stderr)
    assert.match(r.stdout, /8 ricerche per esecuzione, circa 128 al mese/)
    assert.doesNotMatch(r.stdout, /big-island/)
  })

  test('CLI --dry-run --slug big-island-2027: cercato una volta, 3 ricerche', () => {
    const r = cli('--slug', 'big-island-2027')
    assert.equal(r.status, 0, r.stderr)
    assert.match(r.stdout, /big-island-2027: non attivo, cercato una volta/)
    assert.match(r.stdout, /3 tappe × 1 fonti \(booking\) = 3 ricerche/)
    assert.match(r.stdout, /kona: .*2027-02-17 → 2027-02-21 \(4 notti, entro 15 km/)
    assert.match(r.stdout, /volcano: .*\(3 notti, entro 15 km/)
    assert.match(r.stdout, /kohala: .*\(3 notti, entro 20 km/)
    assert.match(r.stdout, /Esecuzione una tantum alloggi: 3 ricerche/)
    assert.doesNotMatch(r.stdout, /al mese/)
    assert.equal(cli('--slug', 'inesistente').status, 1)
  })

  test('monolocali: con monolocali e 1 camera non si scartano gli studio con 0 camere', () => {
    const j = {
      properties: [
        { name: 'Studio', extracted_price: 600, link: 'https://www.booking.com/hotel/us/a.html', rooms: [{ type: 'Studio', bedrooms: 0, bathrooms: 1 }] },
        { name: 'Studio senza camere', extracted_price: 610, link: 'https://www.booking.com/hotel/us/b.html', rooms: [{ type: 'Studio Apartment', bathrooms: 1 }] },
        { name: 'Bilocale', extracted_price: 700, link: 'https://www.booking.com/hotel/us/c.html', rooms: [{ type: 'Apartment', bedrooms: 1, bathrooms: 1 }] },
        { name: 'Camera d’albergo', extracted_price: 500, link: 'https://www.booking.com/hotel/us/d.html', rooms: [{ type: 'Deluxe King Room' }] },
        { name: 'Senza rooms', extracted_price: 450, link: 'https://www.booking.com/hotel/us/e.html' },
        { name: 'Bagno in comune', extracted_price: 300, link: 'https://www.booking.com/hotel/us/f.html', rooms: [{ type: 'Double Room', bedrooms: 1, bathrooms: 0 }] },
      ],
    }
    const m = { notti: 4, camere: 1, bagni: 1, valuta: 'USD' }
    assert.deepEqual(strutture('booking', j, { ...m, monolocali: true }).map((x) => x.nome), [
      'Studio', 'Studio senza camere', 'Bilocale', 'Camera d’albergo', 'Senza rooms',
    ])
    assert.deepEqual(strutture('booking', j, m).map((x) => x.nome), ['Bilocale'])
    // con più camere richieste il monolocale non basta
    assert.deepEqual(strutture('booking', j, { ...m, camere: 2, monolocali: true }).map((x) => x.nome), [])
    assert.equal(big.alloggi.monolocali, true)
  })

  test('tipi di struttura Booking: per Big Island anche hotel, B&B, guest house e lodge; Ovest invariato', () => {
    const t = big.alloggi.tappe[1]
    assert.equal(parametri('booking', big.alloggi, t).get('property_types'), '201,220,204,208,216,221,218')
    assert.equal(parametri('booking', breve.alloggi, breve.alloggi.tappe[0]).get('property_types'), '201,220')
  })

  test('una tantum: limite sulle ricerche dell’esecuzione, non × 16', async () => {
    const tappeFinte = Array.from({ length: 20 }, (_, i) => ({ id: 't' + i, nome: 'T', q: 'X', dal: '2027-02-17', al: '2027-02-18' }))
    const v = { slug: 'tanti', alloggi: { ...big.alloggi, tappe: tappeFinte } }
    const log = silenzio()
    assert.equal(await esegui({ ...base, viaggi: [v], slug: 'tanti', dryRun: true, log }), 0)
    assert.match(log.msgs.info.join('\n'), /Esecuzione una tantum alloggi: 20 ricerche/)
    assert.deepEqual(log.msgs.error, [])
    const troppi = { slug: 'troppi', alloggi: { ...big.alloggi, tappe: Array.from({ length: 251 }, (_, i) => ({ ...tappeFinte[0], id: 'x' + i })) } }
    const l2 = silenzio()
    assert.equal(await esegui({ ...base, viaggi: [troppi], slug: 'troppi', dryRun: true, log: l2 }), 1)
  })

  test('valuta del viaggio come ripiego per Booking senza currency', () => {
    const j = { properties: [{ name: 'A', extracted_price: 600, rooms: [{ bedrooms: 1, bathrooms: 1 }] }] }
    assert.deepEqual(strutture('booking', j, { notti: 4, camere: 1, bagni: 1, valuta: 'USD' }).map((x) => x.valuta), ['USD'])
    assert.deepEqual(strutture('booking', j, { notti: 4, camere: 1, bagni: 1 }).map((x) => x.valuta), ['EUR'])
  })

  test('con slug: solo Booking in dollari, solo big-island-2027/alloggi.csv', async () => {
    const d = mkdtempSync(path.join(dir, 's-'))
    const url = []
    const f0 = fetchFixture(FIXTURE)
    // Fixture Booking senza `currency` e con camere 1 / bagni 1: la valuta viene dal viaggio.
    const fetchImpl = async (u) => {
      url.push(new URL(u).searchParams)
      const r = await f0(u)
      const corpo = await r.json()
      for (const o of corpo.properties ?? []) {
        delete o.currency
        o.rooms = [{ ...o.rooms?.[0], bedrooms: 1, bathrooms: 1 }]
      }
      return { ...r, json: async () => corpo }
    }
    assert.equal(await esegui({ ...base, slug: 'big-island-2027', fetchImpl, outDir: d, log: silenzio() }), 0)
    assert.equal(url.length, 3)
    assert.ok(url.every((p) => p.get('engine') === 'booking' && p.get('currency') === 'USD' && p.get('adults') === '2' && p.get('rooms') === '1'))
    assert.deepEqual(url.map((p) => p.get('q')), big.alloggi.tappe.map((t) => t.q))
    assert.deepEqual(readdirSync(d), ['big-island-2027'])
    const rows = parseCSV(readFileSync(path.join(d, 'big-island-2027', 'alloggi.csv'), 'utf8')).slice(1)
    assert.ok(rows.length > 0)
    assert.ok(rows.every((x) => col(x, 'valuta') === 'USD' && col(x, 'fonte') === 'booking'))
  })
})

describe('Glacier: prolungamento di chi ospita, non attivo, rilevazione una tantum con --slug', () => {
  const gl = viaggi.find((v) => v.slug === 'ovest-2027-glacier')
  const cli = (...args) =>
    spawnSync(process.execPath, [path.join(QUI, 'alloggi.mjs'), '--dry-run', ...args], {
      encoding: 'utf8',
      env: { ...process.env, SERPAPI_KEY_ALLOGGI: '', ALLOGGI_NOW: '2026-10-30T05:17:00Z' },
    })

  test('spento, due basi consecutive di 2 notti dal 29 luglio al 2 agosto: 4 ricerche', () => {
    assert.equal(gl.alloggi.attivo, false)
    assert.deepEqual(attivi(viaggi, '2026-10-30').map((v) => v.slug), ['ovest-2027-short'])
    assert.deepEqual(tappe(gl.alloggi, '2026-10-30').map((t) => [t.id, t.dal, t.al]), [
      ['ovest', '2027-07-29', '2027-07-31'],
      ['est', '2027-07-31', '2027-08-02'],
    ])
    // la prima notte è quella in cui il viaggio breve finisce a Bozeman
    assert.equal(gl.alloggi.tappe[0].dal, breve.alloggi.tappe.at(-1).al)
    assert.deepEqual(stimaBudget([gl], '2026-10-30'), { perEsecuzione: 4, alMese: 64, livello: 'ok' })
    assert.deepEqual([raggioDi(gl.alloggi, gl.alloggi.tappe[0]), raggioDi(gl.alloggi, gl.alloggi.tappe[1])], [25, 40])
    // la base est copre Babb, Many Glacier ed East Glacier (37 km in linea d'aria)
    for (const p of [[48.858, -113.417], [48.797, -113.657], [48.442, -113.218]]) assert.ok(distanzaKm(gl.alloggi.tappe[1].centro, p) < 40, String(p))
    assert.equal(parametri('booking', gl.alloggi, gl.alloggi.tappe[1]).get('property_types'), '201,220,204,208,216,221,218')
    assert.equal(gl.alloggi.monolocali, true)
  })

  test('CLI --dry-run --slug ovest-2027-glacier: cercato una volta, 4 ricerche', () => {
    const r = cli('--slug', 'ovest-2027-glacier')
    assert.equal(r.status, 0, r.stderr)
    assert.match(r.stdout, /ovest-2027-glacier: non attivo, cercato una volta/)
    assert.match(r.stdout, /2 tappe × 2 fonti \(airbnb, booking\) = 4 ricerche/)
    assert.match(r.stdout, /ovest: .*2027-07-29 → 2027-07-31 \(2 notti, entro 25 km/)
    assert.match(r.stdout, /est: .*2027-07-31 → 2027-08-02 \(2 notti, entro 40 km/)
    assert.match(r.stdout, /Esecuzione una tantum alloggi: 4 ricerche/)
    assert.doesNotMatch(r.stdout, /al mese/)
  })

  test('CLI --dry-run senza slug: il viaggio non conta', () => {
    const r = cli()
    assert.equal(r.status, 0, r.stderr)
    assert.match(r.stdout, /8 ricerche per esecuzione, circa 128 al mese/)
    assert.doesNotMatch(r.stdout, /glacier/)
  })
})
