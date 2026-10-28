import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { viaggi } from '../src/viaggi.js'
import {
  HEADER,
  attivi,
  cerca,
  coppie,
  csvRiga,
  esegui,
  fetchFixture,
  opzioni,
  parametri,
  piuEconomica,
  righe,
  stimaBudget,
} from './voli.mjs'

const QUI = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE = path.join(QUI, 'fixtures', 'voli')
const json = (nome) => JSON.parse(readFileSync(path.join(FIXTURE, nome + '.json'), 'utf8'))
const ovest = viaggi.find((v) => v.slug === 'ovest-2027')
const silenzio = () => {
  const msgs = { info: [], warn: [], error: [] }
  return { msgs, info: (m) => msgs.info.push(m), warn: (m) => msgs.warn.push(m), error: (m) => msgs.error.push(m) }
}

// Parser CSV minimale per il round-trip (stesse regole della pagina).
function parseCSV(text) {
  const rows = []
  let row = []
  let f = ''
  let q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        f += '"'
        i++
      } else if (c === '"') q = false
      else f += c
    } else if (c === '"') q = true
    else if (c === ',') {
      row.push(f)
      f = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(f)
      rows.push(row)
      row = []
      f = ''
    } else f += c
  }
  if (f !== '' || row.length) {
    row.push(f)
    rows.push(row)
  }
  return rows
}

describe('configurazione e budget', () => {
  test('coppie: 9 per Ovest, scarta ritorni non successivi', () => {
    assert.equal(coppie(ovest.voli).length, 9)
    const c = coppie({ andata: { date: ['2027-07-16', '2027-07-20'] }, ritorno: { date: ['2027-07-16', '2027-07-20', '2027-07-25'] } })
    assert.deepEqual(c, [
      { andata: '2027-07-16', ritorno: '2027-07-20' },
      { andata: '2027-07-16', ritorno: '2027-07-25' },
      { andata: '2027-07-20', ritorno: '2027-07-25' },
    ])
  })

  test('andate già passate: saltate nelle coppie e nel budget', () => {
    const c = coppie(ovest.voli, '2027-07-17')
    assert.equal(c.length, 6)
    assert.ok(c.every((x) => x.andata >= '2027-07-17'))
    assert.equal(coppie(ovest.voli, '2026-10-28').length, 9)
    assert.deepEqual(stimaBudget([ovest], '2027-07-17'), { perEsecuzione: 7, alMese: 112, livello: 'ok' })
  })

  test('attivi: solo con flag e date future', () => {
    const lista = [
      ovest,
      { slug: 'spento', voli: { ...ovest.voli, attivo: false } },
      { slug: 'senza' },
      { slug: 'passato', voli: { ...ovest.voli, andata: { ...ovest.voli.andata, date: ['2020-01-01'] } } },
    ]
    assert.deepEqual(attivi(lista, '2026-10-28').map((v) => v.slug), ['ovest-2027'])
    assert.deepEqual(attivi(lista, '2027-07-19').map((v) => v.slug), [])
  })

  test('stimaBudget: 10 per esecuzione, 160 al mese; oltre 250 è un errore', () => {
    assert.deepEqual(stimaBudget([ovest]), { perEsecuzione: 10, alMese: 160, livello: 'ok' })
    assert.equal(stimaBudget([ovest, ovest]).livello, 'errore')
    const piccolo = { voli: { andata: { date: ['2027-01-01', '2027-01-02'] }, ritorno: { date: ['2027-01-10', '2027-01-11'] } } }
    assert.equal(stimaBudget([ovest, piccolo]).alMese, 240)
    assert.equal(stimaBudget([ovest, piccolo]).livello, 'avviso')
  })

  test('parametri: multi-city con aeroporti raggruppati', () => {
    const p = parametri(ovest.voli, { andata: '2027-07-17', ritorno: '2027-07-31' }, { api_key: 'k', departure_token: 't' })
    assert.equal(p.get('engine'), 'google_flights')
    assert.equal(p.get('type'), '3')
    assert.equal(p.get('adults'), '4')
    assert.equal(p.get('currency'), 'EUR')
    assert.equal(p.get('hl'), 'it')
    assert.equal(p.get('gl'), 'it')
    assert.equal(p.get('departure_token'), 't')
    assert.deepEqual(JSON.parse(p.get('multi_city_json')), [
      { departure_id: 'BLQ,MXP,VCE', arrival_id: 'DEN', date: '2027-07-17' },
      { departure_id: 'BZN', arrival_id: 'BLQ,MXP,VCE', date: '2027-07-31' },
    ])
    assert.equal(parametri(ovest.voli, { andata: 'a', ritorno: 'b' }, { adults: 1 }).get('adults'), '1')
    assert.equal(p.has('no_cache'), false)
  })
})

describe('parsing e CSV', () => {
  test('opzioni: best + other, salta senza prezzo', () => {
    const o = opzioni(json('andata'))
    assert.equal(o.length, 4)
    assert.deepEqual(o.map((x) => [x.sezione, x.rango]), [['best', 1], ['best', 2], ['other', 1], ['other', 2]])
    assert.deepEqual(o[0], {
      sezione: 'best',
      rango: 1,
      prezzo: 3480,
      compagnie: 'Lufthansa',
      scali: 1,
      aeroporti_scalo: 'FRA',
      durata_min: 755,
      da: 'BLQ',
      a: 'DEN',
      partenza: '2027-07-17 06:40',
      arrivo: '2027-07-17 12:15',
      voli: 'LH 285 LH 480',
      token: 'tok-blq-fra-den',
    })
    assert.equal(o[1].scali, 0)
    assert.equal(o[3].compagnie, 'Air France, operato da HOP! + Air France + United')
    assert.equal(o[3].aeroporti_scalo, 'CDG ORD')
    assert.deepEqual(opzioni(json('vuoto')), [])
    assert.equal(piuEconomica(o).prezzo, 3360)
  })

  test('righe: prezzo a persona = prezzo / adulti', () => {
    const opts = opzioni(json('andata'))
    const r = righe({ run: 'R', tipo: 'andata', coppia: { andata: 'A', ritorno: 'B' }, adulti: 4, opts, migliore: opts[3] })
    assert.equal(r[0].length, HEADER.length)
    assert.equal(r[0][HEADER.indexOf('prezzo_persona')], 870)
    assert.equal(r[3][HEADER.indexOf('prezzo_persona')], 840)
    assert.equal(r[3][HEADER.indexOf('migliore')], 1)
    assert.equal(r[0][HEADER.indexOf('migliore')], '')
    const p = righe({ run: 'R', tipo: 'andata', coppia: { andata: 'A', ritorno: 'B' }, adulti: 3, opts: [{ ...opts[0], prezzo: 1000 }] })
    assert.equal(p[0][HEADER.indexOf('prezzo_persona')], 333.33)
    const s = righe({ run: 'R', tipo: 'andata', coppia: { andata: 'A', ritorno: 'B' }, adulti: 4, base: 'persona', opts: [opts[0]] })
    assert.equal(s[0][HEADER.indexOf('prezzo_persona')], 3480)
  })

  test('csvRiga: virgolette solo dove servono, round-trip', () => {
    assert.equal(csvRiga(['a', 1, '', null]), 'a,1,,')
    assert.equal(csvRiga(['a,b', 'x"y', 'r\nr']), '"a,b","x""y","r\nr"')
    const orig = [['run', 'Air France, operato da HOP!', 'di "lusso"', 'due\nrighe', '3360']]
    assert.deepEqual(parseCSV(orig.map(csvRiga).join('\r\n') + '\r\n'), orig)
  })
})

describe('chiamate', () => {
  const risposta = (status, corpo) => async () => ({ ok: status < 400, status, json: async () => corpo })

  test('ok, vuoto, retry su 5xx, fatali', async () => {
    const p = new URLSearchParams({ api_key: 'segreta' })
    assert.equal((await cerca(p, { fetchImpl: risposta(200, json('andata')) })).stato, 'ok')
    assert.equal((await cerca(p, { fetchImpl: risposta(200, json('vuoto')) })).stato, 'vuoto')

    let n = 0
    const instabile = async () => {
      n++
      return n === 1 ? { ok: false, status: 503, json: async () => ({ error: 'busy' }) } : { ok: true, status: 200, json: async () => json('andata') }
    }
    assert.equal((await cerca(p, { fetchImpl: instabile, ritardoRetry: 0 })).stato, 'ok')
    assert.equal(n, 2)

    const rete = async () => {
      throw new Error('ECONNRESET')
    }
    assert.equal((await cerca(p, { fetchImpl: rete, ritardoRetry: 0 })).stato, 'fallito')

    await assert.rejects(cerca(p, { fetchImpl: risposta(401, json('chiave')) }), /chiave SerpApi/)
    await assert.rejects(cerca(p, { fetchImpl: risposta(200, json('chiave')) }), /chiave SerpApi/)
    await assert.rejects(cerca(p, { fetchImpl: risposta(429, { error: 'limit' }) }), /429/)
    await assert.rejects(cerca(p, { fetchImpl: risposta(400, { error: 'bad' }) }), (e) => {
      assert.match(e.message, /api_key=\*\*\*/)
      assert.doesNotMatch(e.message, /segreta/)
      return true
    })
  })
})

describe('esecuzione completa con fixture', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'voli-'))
  after(() => rmSync(dir, { recursive: true, force: true }))
  const base = { viaggi: [ovest], apiKey: 'fixture', fetchImpl: fetchFixture(FIXTURE), ritardoRetry: 0 }
  const csv = path.join(dir, 'ovest-2027', 'voli.csv')

  test('prima esecuzione crea intestazione e righe, la seconda accoda', async () => {
    const log = silenzio()
    assert.equal(await esegui({ ...base, outDir: dir, now: '2026-10-28T05:17:00Z', log }), 0)
    const r1 = parseCSV(readFileSync(csv, 'utf8'))
    assert.deepEqual(r1[0], HEADER)
    // 9 coppie × 4 opzioni + 2 opzioni di ritorno
    assert.equal(r1.length, 1 + 9 * 4 + 2)
    const col = (r, k) => r[HEADER.indexOf(k)]
    const andata = r1.slice(1).filter((r) => col(r, 'tipo') === 'andata')
    const ritorno = r1.slice(1).filter((r) => col(r, 'tipo') === 'ritorno')
    assert.equal(andata.length, 36)
    assert.equal(ritorno.length, 2)
    assert.ok(r1.slice(1).every((r) => col(r, 'run') === '2026-10-28T05:17:00Z'))
    // la scelta è la più economica della prima coppia, con le stesse date nel ritorno
    const migliori = andata.filter((r) => col(r, 'migliore') === '1')
    assert.equal(migliori.length, 1)
    assert.equal(col(migliori[0], 'prezzo'), '3360')
    assert.equal(col(migliori[0], 'data_andata'), '2027-07-16')
    assert.equal(col(ritorno[0], 'data_andata'), '2027-07-16')
    assert.equal(col(ritorno[0], 'data_ritorno'), '2027-07-30')
    assert.deepEqual(ritorno.map((r) => col(r, 'migliore')), ['1', ''])
    assert.equal(col(ritorno[0], 'prezzo_persona'), '840')
    assert.equal(col(ritorno[0], 'base'), 'totale')

    assert.equal(await esegui({ ...base, outDir: dir, now: '2026-10-30T05:17:00Z', log }), 0)
    const testo = readFileSync(csv, 'utf8')
    const r2 = parseCSV(testo)
    assert.equal(r2.length, 1 + 2 * 38)
    assert.equal(testo.split('\n').filter((l) => l.startsWith('run,')).length, 1)
    assert.equal(existsSync(csv + '.tmp'), false)
  })

  test('intestazione diversa: errore e file invariato', async () => {
    const d = mkdtempSync(path.join(dir, 'h-'))
    const f = path.join(d, 'ovest-2027', 'voli.csv')
    await esegui({ ...base, outDir: d, now: '2026-10-28T05:17:00Z', log: silenzio() })
    const alterato = readFileSync(f, 'utf8').replace(/^run,/, 'giro,')
    writeFileSync(f, alterato)
    const log = silenzio()
    assert.equal(await esegui({ ...base, outDir: d, now: '2026-10-30T05:17:00Z', log }), 1)
    assert.equal(readFileSync(f, 'utf8'), alterato)
    assert.match(log.msgs.error.join('\n'), /intestazione/)
  })

  test('VOLI_NOW a viaggio iniziato: si cercano solo le andate future', async () => {
    const d = mkdtempSync(path.join(dir, 'o-'))
    const date = []
    const base0 = fetchFixture(FIXTURE)
    const fetchImpl = async (url) => {
      const p = new URL(url).searchParams
      if (!p.has('departure_token')) date.push(JSON.parse(p.get('multi_city_json'))[0].date)
      return base0(url)
    }
    assert.equal(await esegui({ ...base, fetchImpl, outDir: d, now: '2027-07-17T05:17:00Z', log: silenzio() }), 0)
    assert.equal(date.length, 6)
    assert.ok(date.every((x) => x >= '2027-07-17'))
    const r = parseCSV(readFileSync(path.join(d, 'ovest-2027', 'voli.csv'), 'utf8'))
    assert.equal(r.length, 1 + 6 * 4 + 2)
  })

  test('CSV esistente ma vuoto: si scrive l’intestazione', async () => {
    const d = mkdtempSync(path.join(dir, 'z-'))
    const f = path.join(d, 'ovest-2027', 'voli.csv')
    mkdirSync(path.dirname(f), { recursive: true })
    writeFileSync(f, '')
    assert.equal(await esegui({ ...base, outDir: d, now: '2026-10-28T05:17:00Z', log: silenzio() }), 0)
    const r = parseCSV(readFileSync(f, 'utf8'))
    assert.deepEqual(r[0], HEADER)
    assert.equal(r.length, 1 + 38)
  })

  test('chiave non valida: nessun file', async () => {
    const d = mkdtempSync(path.join(dir, 'k-'))
    const log = silenzio()
    const codice = await esegui({ ...base, fetchImpl: fetchFixture(FIXTURE, 'chiave'), outDir: d, now: '2026-10-28T05:17:00Z', log })
    assert.equal(codice, 1)
    assert.equal(existsSync(path.join(d, 'ovest-2027')), false)
    assert.match(log.msgs.error.join('\n'), /chiave/)
  })

  test('nessun risultato ovunque: errore e nessuna scrittura', async () => {
    const d = mkdtempSync(path.join(dir, 'v-'))
    const log = silenzio()
    const codice = await esegui({ ...base, fetchImpl: fetchFixture(FIXTURE, 'vuoto'), outDir: d, now: '2026-10-28T05:17:00Z', log })
    assert.equal(codice, 1)
    assert.equal(existsSync(path.join(d, 'ovest-2027')), false)
    assert.equal(log.msgs.warn.length, 9)
  })

  test('chiave mancante', async () => {
    const log = silenzio()
    assert.equal(await esegui({ ...base, apiKey: undefined, outDir: dir, log }), 1)
    assert.match(log.msgs.error[0], /SERPAPI_KEY mancante/)
  })

  test('budget oltre il limite: nessuna chiamata', async () => {
    let chiamate = 0
    const log = silenzio()
    const fetchImpl = async () => {
      chiamate++
      throw new Error('non dovrebbe chiamare')
    }
    const due = [ovest, { ...ovest, slug: 'altro' }]
    assert.equal(await esegui({ ...base, viaggi: due, fetchImpl, outDir: dir, now: '2026-10-28T05:17:00Z', log }), 1)
    assert.equal(chiamate, 0)
  })

  test('CLI --dry-run: 10 ricerche per esecuzione, 160 al mese', () => {
    const r = spawnSync(process.execPath, [path.join(QUI, 'voli.mjs'), '--dry-run'], {
      encoding: 'utf8',
      env: { ...process.env, SERPAPI_KEY: '', VOLI_NOW: '2026-10-28T05:17:00Z' },
    })
    assert.equal(r.status, 0, r.stderr)
    assert.match(r.stdout, /10 ricerche per esecuzione, circa 160 al mese/)
  })
})
