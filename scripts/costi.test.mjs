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
  // subito dopo il Sud America, primo della lista
  assert.equal(viaggi[1], big)
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

test('datiPagina di Glacier: dollari, una coppia, rilevazione unica, 4 notti dal 29 luglio, scenari Missoula e Bozeman', () => {
  const gl = viaggi.find((v) => v.slug === 'ovest-2027-glacier')
  assert.equal(viaggi[viaggi.indexOf(breve) + 1], gl)
  const d = datiPagina(gl, { playlist: playlist[gl.slug], generi: GENERI })
  assert.equal(d.valuta, 'USD')
  assert.deepEqual(d.aggiornamento, { voli: false, alloggi: false })
  assert.equal(d.coppie, 1)
  assert.equal(d.adultiInVolo, 2)
  assert.deepEqual([d.partenze, d.arrivo, d.ritornoDa], [['DEN'], ['JAC'], ['FCA']])
  assert.deepEqual(d.accesso, { aeroporti: { DEN: { auto: 0, parcheggio: 140 } }, persona: { DEN: 70 } })
  const t = d.alloggi.tappe
  assert.deepEqual(t.map((x) => [x.id, x.dal, x.al, x.notti]), [['ovest', '2027-07-29', '2027-07-31', 2], ['est', '2027-07-31', '2027-08-02', 2]])
  assert.equal(t[0].dal, breve.alloggi.tappe.at(-1).al)
  assert.deepEqual([d.alloggi.adulti, d.alloggi.camere, d.alloggi.bagni], [2, 1, 1])
  assert.deepEqual(t.map((x) => x.raggioKm), [25, 40])
  assert.match(t[1].nota, /Many Glacier/)
  assert.deepEqual(d.extra[0], { voce: gl.costi.noleggio.voce, importo: null })
  assert.match(d.extra[0].voce, /Bozeman.*Kalispell.*solo andata/)
  assert.ok(d.extra.every((e) => !/nazional/i.test(e.voce)), JSON.stringify(d.extra))
  assert.deepEqual(d.carburante, carburante(gl.costi.carburante))
  assert.deepEqual([d.ospiti, d.rientro], [[], null])
  assert.deepEqual(d.alternative.map((a) => [a.id, a.csv, a.partenze, a.arrivo, a.ritornoDa]), [
    ['mso', 'voli-mso.csv', ['DEN'], ['JAC'], ['MSO']],
    ['bzn', 'voli-bzn.csv', ['DEN'], ['JAC'], ['BZN']],
  ])
  for (const a of d.alternative) {
    assert.deepEqual(a.carburante, carburante(gl.costi.carburante, gl.costi.alternative[a.id].carburante.km))
    assert.ok(a.carburante.km > d.carburante.km, a.id)
    assert.deepEqual(a.noleggio, { voce: gl.costi.alternative[a.id].noleggio.voce, importo: null })
    assert.deepEqual(a.ospiti, [])
  }
  assert.ok(d.alternative[1].carburante.km > d.alternative[0].carburante.km)
  assert.match(d.alternative[0].descrizione, /Missoula/)
  assert.match(d.alternative[1].descrizione, /Bozeman/)
  assert.deepEqual(d.playlist.blocchi.map((b) => b.giorno), [10, 11, 12, 14])
})

test('datiPagina del Sud America: dollari, una coppia, rilevazione unica, 22 tappe con il buco del tour di Uyuni, 9 voli interni', () => {
  const sa = viaggi.find((v) => v.slug === 'sudamerica-2028')
  assert.equal(viaggi[0], sa)
  const d = datiPagina(sa, { playlist: playlist[sa.slug], generi: GENERI })
  assert.equal(d.valuta, 'USD')
  assert.deepEqual(d.aggiornamento, { voli: false, alloggi: false })
  assert.equal(d.coppie, 1)
  assert.equal(d.adultiInVolo, 2)
  assert.deepEqual([d.partenze, d.arrivo, d.ritornoDa], [['DEN'], ['PUQ', 'PNT'], ['GYE']])
  // Uber andata e ritorno, niente parcheggio
  assert.deepEqual(d.accesso, { aeroporti: { DEN: { auto: 60, parcheggio: 0 } }, persona: { DEN: 60 } })
  const t = d.alloggi.tappe
  assert.equal(t.length, 22)
  assert.equal(t[0].dal, '2028-04-08')
  assert.equal(t.at(-1).al, '2028-05-16')
  // consecutive, tranne le due notti del tour di gruppo (comprese nel prezzo del tour)
  const buchi = []
  for (let i = 1; i < t.length; i++) if (t[i].dal !== t[i - 1].al) buchi.push([t[i - 1].al, t[i].dal])
  assert.deepEqual(buchi, [['2028-04-24', '2028-04-26']])
  // 38 notti dall’8 aprile al 16 maggio, meno le due del tour
  assert.equal(t.reduce((n, x) => n + x.notti, 0), 36)
  assert.match(t.find((x) => x.id === 'uyuni').nota, /tour/)
  assert.match(t.find((x) => x.id === 'antigua').nota, /Acatenango/)
  // il treno Titicaca parte da Puno solo lunedì, giovedì e sabato: due notti a Puno, treno lunedì 1° maggio
  const puno = t.find((x) => x.id === 'puno')
  assert.deepEqual([puno.dal, puno.al], ['2028-04-29', '2028-05-01'])
  assert.equal(new Date(puno.al + 'T12:00:00Z').getUTCDay(), 1)
  assert.deepEqual([d.alloggi.adulti, d.alloggi.camere, d.alloggi.bagni], [2, 1, 1])
  assert.equal(sa.alloggi.paese, undefined)
  // niente noleggio né benzina: gli extra sono solo le voci a mano, tutte con importo
  assert.equal(d.carburante, null)
  assert.equal(sa.costi.noleggio, undefined)
  assert.ok(d.extra.every((e) => typeof e.importo === 'number' && e.importo > 0), JSON.stringify(d.extra))
  assert.equal(d.extra.reduce((n, e) => n + e.importo, 0), 5885)
  assert.ok(d.extra.some((e) => /PeruRail Titicaca/.test(e.voce)))
  assert.ok(d.extra.some((e) => /Humantay/.test(e.voce)))
  assert.ok(d.extra.some((e) => /Vinicunca/.test(e.voce)))
  assert.deepEqual(d.ospiti.map((x) => [x.id, x.da[0], x.a[0], x.date[0], x.adulti]), [
    ['fte-igr', 'FTE', 'IGR', '2028-04-16', 2],
    ['igu-slz', 'IGU', 'SLZ', '2028-04-18', 2],
    ['slz-scl', 'SLZ', 'SCL', '2028-04-21', 2],
    ['scl-cjc', 'SCL', 'CJC', '2028-04-22', 2],
    ['uyu-lpb', 'UYU', 'LPB', '2028-04-27', 2],
    ['cuz-gua', 'CUZ', 'GUA', '2028-05-07', 2],
    ['gua-gye', 'GUA', 'GYE', '2028-05-10', 2],
    ['gye-gps', 'GYE', 'GPS', '2028-05-11', 2],
    ['gps-gye', 'GPS', 'GYE', '2028-05-15', 2],
  ])
  assert.ok(d.ospiti.every((x) => x.voce.includes('→')))
  assert.deepEqual([d.alternative, d.rientro], [[], null])
  assert.deepEqual(d.playlist.blocchi.map((b) => b.giorno), [5, 7, 13, 18, 22, 25, 29])
  assert.equal(d.playlist.spotify, null)
  assert.equal(d.playlist.generi.latino, 'Musica latinoamericana')
})
