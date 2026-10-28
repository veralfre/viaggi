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
  return {
    versione: 1,
    valuta: 'EUR',
    coppie: v.costi?.coppie ?? null,
    adultiInVolo: adulti,
    accesso: acc ? { aeroporti: acc, persona } : null,
    alloggi: al
      ? {
          adulti: al.adulti,
          camere: al.camere,
          bagni: al.bagni,
          tappe: al.tappe.map((t) => ({ id: t.id, nome: t.nome, dal: t.dal, al: t.al, notti: notti(t.dal, t.al), nota: t.nota ?? '' })),
        }
      : null,
    extra: (v.costi?.extra ?? []).map((e) => ({ voce: e.voce, importo: typeof e.importo === 'number' ? e.importo : null })),
    playlist: datiPlaylist(extra.playlist, extra.spotify, extra.generi),
  }
}
