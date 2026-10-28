import assert from 'node:assert/strict'
import { test } from 'node:test'
import { accessoPersona, costoAccesso, datiPagina, notti } from '../src/costi.js'
import { viaggi } from '../src/viaggi.js'

const ovest = viaggi.find((v) => v.slug === 'ovest-2027')
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

test('notti', () => {
  assert.equal(notti('2027-07-17', '2027-07-18'), 1)
  assert.equal(notti('2027-07-30', '2027-08-02'), 3)
})

test('datiPagina: tappe consecutive per 14 notti, extra nulli preservati', () => {
  const d = datiPagina(ovest)
  assert.equal(d.versione, 1)
  assert.equal(d.coppie, 3)
  assert.equal(d.adultiInVolo, 4)
  assert.deepEqual(d.accesso.persona, { BLQ: 0, MXP: 57.5, VCE: 41.5 })
  const t = d.alloggi.tappe
  assert.equal(t[0].dal, '2027-07-17')
  assert.equal(t.at(-1).al, '2027-07-31')
  for (let i = 1; i < t.length; i++) assert.equal(t[i].dal, t[i - 1].al)
  assert.equal(t.reduce((n, x) => n + x.notti, 0), 14)
  assert.match(t.find((x) => x.id === 'west-yellowstone').nota, /West Yellowstone/)
  assert.deepEqual(d.extra, [
    { voce: 'Noleggio SUV', importo: null },
    { voce: 'Carburante (circa 2.300 km)', importo: null },
  ])
  assert.deepEqual(datiPagina({ slug: 'x' }), { versione: 1, valuta: 'EUR', coppie: null, adultiInVolo: null, accesso: null, alloggi: null, extra: [], playlist: null })
})
