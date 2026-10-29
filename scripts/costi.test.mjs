import assert from 'node:assert/strict'
import { test } from 'node:test'
import { accessoPersona, carburante, costoAccesso, datiPagina, notti, valutaDi, voliOspiti } from '../src/costi.js'
import { GENERI, playlist } from '../src/playlist.js'
import { viaggi } from '../src/viaggi.js'

const ovest = viaggi.find((v) => v.slug === 'ovest-2027')
const breve = viaggi.find((v) => v.slug === 'ovest-2027-short')
const acc = ovest.voli.accesso

test('accesso: andata + ritorno + parcheggio, diviso per chi vola', () => {
  assert.equal(costoAccesso(acc, 'MXP'), 230)
  assert.equal(accessoPersona(acc, 4, 'MXP'), 57.5)
  assert.equal(costoAccesso(acc, 'VCE'), 166)
  assert.equal(accessoPersona(acc, 4, 'VCE'), 41.5)
  assert.equal(accessoPersona(acc, 4, 'BLQ'), 0)
  assert.equal(costoAccesso(acc, 'FCO'), null)
  assert.equal(accessoPersona(acc, 4, 'FCO'), null)
  assert.equal(accessoPersona(null, 4, 'MXP'), null)
})

test('carburante', () => {
  const c = { km: 2300, litriPer100: 12.5, euroLitro: 0.85 }
  assert.deepEqual(carburante(c), { km: 2300, litri: 288, importo: 244.38 })
  assert.deepEqual(carburante(c, 1100), { km: 1100, litri: 138, importo: 116.88 })
  assert.equal(carburante(null), null)
  assert.equal(carburante({ km: 100 }), null)
  // prezzoLitro è il nome nuovo (nella valuta del viaggio), euroLitro resta accettato
  assert.deepEqual(carburante({ km: 2300, litriPer100: 12.5, prezzoLitro: 0.85 }), carburante(c))
})

test('valutaDi: codice ISO del viaggio, altrimenti EUR', () => {
  assert.equal(valutaDi({ valuta: 'USD' }), 'USD')
  assert.equal(valutaDi({}), 'EUR')
  assert.equal(valutaDi({ valuta: '$' }), 'EUR')
  assert.equal(valutaDi(undefined), 'EUR')
  assert.equal(datiPagina(ovest).valuta, 'EUR')
  assert.deepEqual(datiPagina(breve).aggiornamento, { voli: true, alloggi: true })
})

test('datiPagina di Big Island: dollari, una coppia, rilevazione unica, 10 notti in tre tappe', () => {
  const big = viaggi.find((v) => v.slug === 'big-island-2027')
  assert.equal(viaggi[0], big)
  const d = datiPagina(big, { playlist: playlist[big.slug], generi: GENERI })
  assert.equal(d.valuta, 'USD')
  assert.deepEqual(d.aggiornamento, { voli: false, alloggi: false })
  assert.equal(d.coppie, 1)
  assert.equal(d.adultiInVolo, 2)
  assert.deepEqual([d.partenze, d.arrivo, d.ritornoDa], [['DEN'], ['KOA'], ['KOA']])
  assert.deepEqual(d.accesso, { aeroporti: { DEN: { auto: 0, parcheggio: 110 } }, persona: { DEN: 55 } })
  const t = d.alloggi.tappe
  assert.deepEqual(t.map((x) => x.id), ['kona', 'volcano', 'kohala'])
  assert.equal(t[0].dal, '2027-02-17')
  assert.equal(t.at(-1).al, '2027-02-27')
  for (let i = 1; i < t.length; i++) assert.equal(t[i].dal, t[i - 1].al)
  assert.deepEqual(t.map((x) => x.notti), [4, 3, 3])
  assert.deepEqual(t.map((x) => x.vicino), ['Kona', 'Volcano', 'Waimea'])
  assert.deepEqual([d.alloggi.adulti, d.alloggi.camere, d.alloggi.bagni], [2, 1, 1])
  assert.deepEqual(d.extra[0], { voce: big.costi.noleggio.voce, importo: null })
  // gli ingressi ai parchi nazionali sono coperti dal pass: non stanno tra gli extra
  assert.ok(d.extra.every((e) => !/nazional/i.test(e.voce)), JSON.stringify(d.extra))
  assert.equal(d.extra.slice(1).reduce((n, e) => n + e.importo, 0), 660 + 272 + 293 + 40 + 25)
  assert.deepEqual(d.carburante, { km: 820, litri: 66, importo: 98.4 })
  assert.deepEqual([d.ospiti, d.alternative, d.rientro], [[], [], null])
  assert.deepEqual(d.playlist.blocchi.map((b) => b.giorno), [1, 5, 8, 11])
  assert.equal(d.playlist.spotify, null)
  assert.equal(d.playlist.generi.isole, 'Musica delle isole')
})

test('notti', () => {
  assert.equal(notti('2027-07-17', '2027-07-18'), 1)
  assert.equal(notti('2027-07-30', '2027-08-02'), 3)
})

test('datiPagina: tappe consecutive per 14 notti, noleggio tra gli extra, carburante a parte', () => {
  const d = datiPagina(ovest)
  assert.equal(d.versione, 1)
  assert.equal(d.coppie, 3)
  assert.equal(d.adultiInVolo, 4)
  assert.deepEqual(d.accesso.persona, { BLQ: 0, MXP: 57.5, VCE: 41.5 })
  assert.deepEqual(d.partenze, ['BLQ', 'MXP', 'VCE'])
  assert.deepEqual(d.rientro, { adulti: 2, da: ['BZN'], a: ['DEN'], date: ['2027-07-29'] })
  const t = d.alloggi.tappe
  assert.equal(t[0].dal, '2027-07-15')
  assert.equal(t.at(-1).al, '2027-07-29')
  for (let i = 1; i < t.length; i++) assert.equal(t[i].dal, t[i - 1].al)
  assert.equal(t.reduce((n, x) => n + x.notti, 0), 14)
  assert.match(t.find((x) => x.id === 'west-yellowstone').nota, /West Yellowstone/)
  assert.deepEqual(d.extra, [{ voce: ovest.costi.noleggio.voce, importo: 1816 }])
  assert.deepEqual(d.carburante, { km: 2300, litri: 288, importo: 244.38 })
  assert.deepEqual(datiPagina({ costi: { extra: [{ voce: 'Pulizie', importo: null }] } }).extra, [{ voce: 'Pulizie', importo: null }])
  assert.deepEqual(d.ospiti, [{ id: 'rientro', voce: 'Volo di rientro', adulti: 2, da: ['BZN'], a: ['DEN'], date: ['2027-07-29'] }])
  assert.deepEqual(d.alternative, [])
  assert.deepEqual(datiPagina({ slug: 'x' }), {
    versione: 1, valuta: 'EUR', aggiornamento: { voli: false, alloggi: false }, coppie: null, adultiInVolo: null, partenze: null, arrivo: null, ritornoDa: null, accesso: null, alloggi: null, extra: [],
    carburante: null, rientro: null, ospiti: [], alternative: [], playlist: null,
  })
})

test('voliOspiti: lista (scarta attivo false) e vecchia forma rientroOspiti', () => {
  assert.deepEqual(voliOspiti(breve.voli).map((t) => [t.id, t.da, t.a, t.date, t.adulti]), [
    ['arrivo', ['DEN'], ['JAC'], ['2027-07-20'], 2],
    ['rientro', ['BZN'], ['DEN'], ['2027-07-29'], 2],
  ])
  assert.deepEqual(voliOspiti({ ospiti: [{ id: 'a', adulti: 2, da: ['X'], a: ['Y'], date: ['2027-01-01'], attivo: false }] }), [])
  assert.deepEqual(voliOspiti(ovest.voli), [{ id: 'rientro', voce: 'Volo di rientro', adulti: 2, da: ['BZN'], a: ['DEN'], date: ['2027-07-29'] }])
  assert.deepEqual(voliOspiti({ rientroOspiti: { ...ovest.voli.rientroOspiti, attivo: false } }), [])
  assert.deepEqual(voliOspiti(undefined), [])
})

test('datiPagina del viaggio breve: 9 notti dal 20 al 29, noleggio da definire, chi ospita, scenario Salt Lake City', () => {
  const d = datiPagina(breve)
  assert.equal(d.coppie, 3)
  assert.deepEqual(d.partenze, ['BLQ', 'MXP', 'VCE'])
  const t = d.alloggi.tappe
  assert.deepEqual(t.map((x) => x.id), ['jackson', 'west-yellowstone', 'gardiner', 'bozeman'])
  assert.equal(t[0].dal, '2027-07-20')
  assert.equal(t.at(-1).al, '2027-07-29')
  for (let i = 1; i < t.length; i++) assert.equal(t[i].dal, t[i - 1].al)
  assert.equal(t.reduce((n, x) => n + x.notti, 0), 9)
  assert.deepEqual(d.extra, [{ voce: breve.costi.noleggio.voce, importo: null }])
  assert.deepEqual(d.carburante, carburante(breve.costi.carburante))
  assert.equal(d.carburante.km, breve.costi.carburante.km)
  assert.equal(d.rientro, null)
  assert.deepEqual(d.ospiti.map((x) => x.id), ['arrivo', 'rientro'])
  assert.equal(d.alternative.length, 1)
  const a = d.alternative[0]
  assert.equal(a.id, 'slc')
  assert.equal(a.csv, 'voli-slc.csv')
  assert.deepEqual([a.partenze, a.arrivo, a.ritornoDa], [['BLQ', 'MXP', 'VCE'], ['SLC'], ['SLC']])
  assert.deepEqual(a.ospiti.map((x) => [x.da[0], x.a[0], x.date[0]]), [['DEN', 'SLC', '2027-07-20'], ['SLC', 'DEN', '2027-07-29']])
  assert.deepEqual(a.carburante, carburante(breve.costi.carburante, breve.costi.alternative.slc.carburante.km))
  assert.ok(a.carburante.km > d.carburante.km)
  assert.deepEqual(a.noleggio, { voce: breve.costi.alternative.slc.noleggio.voce, importo: null })
  assert.match(a.descrizione, /Salt Lake City/)
})
