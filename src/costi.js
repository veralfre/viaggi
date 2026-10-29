// Calcoli di costo condivisi tra la build (viaggio.json per le pagine) e i test.
// ESM puro, nessuna dipendenza.

const r2 = (n) => Math.round(n * 100) / 100

/**
 * Costo per l'auto intera per andare e tornare dallo stesso aeroporto:
 * due tratte (andata e ritorno) più il parcheggio per tutto il soggiorno.
 * null se l'aeroporto non è configurato.
 */
export function costoAccesso(acc, da) {
  const a = acc?.[da]
  if (!a || typeof a.auto !== 'number' || typeof a.parcheggio !== 'number') return null
  return 2 * a.auto + a.parcheggio
}

/** Costo di accesso a persona: un'auto per chi vola, divisa tra loro. */
export function accessoPersona(acc, adulti, da) {
  const c = costoAccesso(acc, da)
  return c == null || !adulti ? null : r2(c / adulti)
}

/** Notti tra due date YYYY-MM-DD. */
export function notti(dal, al) {
  const t = (s) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10))
  return Math.round((t(al) - t(dal)) / 86400000)
}

/** Carburante per km percorsi: { km, litri, importo } in euro, null se la stima non è configurata. */
export function carburante(c, km = c?.km) {
  if (!c || typeof km !== 'number' || typeof c.litriPer100 !== 'number' || typeof c.euroLitro !== 'number') return null
  const litri = (km * c.litriPer100) / 100
  return { km, litri: Math.round(litri), importo: r2(litri * c.euroLitro) }
}

/**
 * Voli di sola andata di chi ospita, come lista di tratte { id, voce, adulti, da, a, date }:
 * `voli.ospiti` (le tratte con `attivo: false` si scartano) oppure la vecchia forma
 * `voli.rientroOspiti` (una tratta, solo con `attivo: true`). [] se non ce ne sono.
 */
export function voliOspiti(voli) {
  const tratta = (t, id, voce) => ({ id: t.id ?? id, voce: t.voce ?? voce, adulti: t.adulti, da: t.da, a: t.a, date: t.date })
  if (Array.isArray(voli?.ospiti)) return voli.ospiti.filter((t) => t.attivo !== false).map((t, i) => tratta(t, 'ospiti-' + (i + 1), 'Volo di chi ospita'))
  const r = voli?.rientroOspiti
  return r?.attivo === true ? [tratta(r, 'rientro', 'Volo di rientro')] : []
}

const ID_SPOTIFY = /^[A-Za-z0-9]{22}$/

/** Scaletta per la pagina: blocchi con brani { artista, titolo, genere } e ID Spotify se valido. */
export function datiPlaylist(pl, spotify, generi = {}) {
  if (!pl) return null
  return {
    spotify: typeof spotify === 'string' && ID_SPOTIFY.test(spotify) ? spotify : null,
    nome: pl.nome,
    descrizione: pl.descrizione ?? '',
    generi,
    blocchi: pl.blocchi.map((b) => ({
      id: b.id, giorno: b.giorno, titolo: b.titolo, tragitto: b.tragitto,
      brani: b.brani.map(([artista, titolo, genere]) => ({ artista, titolo, genere })),
    })),
  }
}

/**
 * Dati per la pagina del viaggio (serviti come /<slug>/viaggio.json).
 * extra: { playlist, spotify, generi } per la sezione «Playlist del viaggio».
 */
export function datiPagina(v, extra = {}) {
  const acc = v.voli?.accesso ?? null
  const adulti = v.voli?.adulti ?? null
  const persona = {}
  for (const da of Object.keys(acc ?? {})) persona[da] = accessoPersona(acc, adulti, da)
  const al = v.alloggi
  const n = v.costi?.noleggio
  const carb = v.costi?.carburante
  // Il noleggio entra tra gli extra anche senza importo («da definire», fuori dalla somma).
  const voci = (n ? [n] : []).concat(v.costi?.extra ?? [])
  const noleggio = (x) => (x ? { voce: x.voce, importo: typeof x.importo === 'number' ? x.importo : null } : null)
  return {
    versione: 1,
    valuta: 'EUR',
    coppie: v.costi?.coppie ?? null,
    adultiInVolo: adulti,
    partenze: v.voli?.andata?.da ?? null,
    arrivo: v.voli?.andata?.a ?? null,
    ritornoDa: v.voli?.ritorno?.da ?? null,
    accesso: acc ? { aeroporti: acc, persona } : null,
    alloggi: al
      ? {
          adulti: al.adulti,
          camere: al.camere,
          bagni: al.bagni,
          tappe: al.tappe.map((t) => ({
            id: t.id, nome: t.nome, dal: t.dal, al: t.al, notti: notti(t.dal, t.al), nota: t.nota ?? '',
            vicino: t.vicino ?? t.nome, raggioKm: t.raggioKm ?? al.raggioKm ?? null,
          })),
        }
      : null,
    extra: voci.map((e) => ({ voce: e.voce, importo: typeof e.importo === 'number' ? e.importo : null })),
    carburante: carburante(carb),
    rientro: v.voli?.rientroOspiti?.attivo === true
      ? { adulti: v.voli.rientroOspiti.adulti, da: v.voli.rientroOspiti.da, a: v.voli.rientroOspiti.a, date: v.voli.rientroOspiti.date }
      : null,
    ospiti: voliOspiti(v.voli),
    // Scenari di confronto (voli.alternative), ognuno con il suo CSV e i suoi costi (costi.alternative[id]).
    alternative: (v.voli?.alternative ?? []).map((a) => {
      const c = v.costi?.alternative?.[a.id] ?? {}
      return {
        id: a.id, nome: a.nome ?? a.id, descrizione: a.descrizione ?? '', csv: a.csv ?? 'voli-' + a.id + '.csv',
        partenze: a.andata.da, arrivo: a.andata.a, ritornoDa: a.ritorno.da, ospiti: voliOspiti(a),
        carburante: carburante(carb && { ...carb, ...c.carburante }), noleggio: noleggio(c.noleggio),
      }
    }),
    playlist: datiPlaylist(extra.playlist, extra.spotify, extra.generi),
  }
}
