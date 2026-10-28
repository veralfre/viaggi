#!/usr/bin/env node
// Crea o aggiorna su Spotify la playlist di un viaggio dalla scaletta di src/playlist.js.
// Script LOCALE (non gira in CI): login nel browser con Authorization Code + PKCE,
// niente client secret. Salva l'ID della playlist in src/spotify.json: la build lo
// mette in /<slug>/viaggio.json e la pagina mostra il player.
//
//   SPOTIFY_CLIENT_ID=… node scripts/spotify.mjs [--slug ovest-2027]
//   node scripts/spotify.mjs --dry-run      scaletta e query, senza rete
//
// Ripetibile: se src/spotify.json ha già l'ID, sostituisce i brani della stessa playlist.
// La playlist è pubblica e non collaborativa (vedi README): il player incorporato funziona
// per tutti e la fonte di verità resta src/playlist.js.

import { spawn } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { playlist as PLAYLIST } from '../src/playlist.js'

export const REDIRECT = 'http://127.0.0.1:8888/callback'
export const SCOPE = 'playlist-modify-public playlist-modify-private'
const AUTH = 'https://accounts.spotify.com/authorize'
const TOKEN = 'https://accounts.spotify.com/api/token'
const API = 'https://api.spotify.com/v1'
const RADICE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const FILE_ID = path.join(RADICE, 'src', 'spotify.json')

const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

/** code_challenge S256 di un code_verifier (RFC 7636). */
export const challengeDa = (verifier) => b64url(createHash('sha256').update(verifier).digest())

/** Coppia PKCE: verifier di 64 caratteri base64url e la sua challenge. */
export function pkce() {
  const verifier = b64url(randomBytes(48))
  return { verifier, challenge: challengeDa(verifier) }
}

/** URL di autorizzazione per il login nel browser. */
export function urlAutorizzazione({ clientId, challenge, state, redirect = REDIRECT, scope = SCOPE }) {
  const p = new URLSearchParams({
    client_id: clientId, response_type: 'code', redirect_uri: redirect, code_challenge_method: 'S256',
    code_challenge: challenge, state, scope,
  })
  return AUTH + '?' + p.toString()
}

/** Divide un array in pezzi da n (l'API accetta al massimo 100 brani per chiamata). */
export function aPezzi(arr, n = 100) {
  const out = []
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
  return out
}

const pulisci = (s) => String(s).replace(/"/g, '').trim()

/** Query di ricerca: prima stretta (campi track/artist), poi libera come ripiego. */
export function query(artista, titolo) {
  return { stretta: 'track:"' + pulisci(titolo) + '" artist:"' + pulisci(artista) + '"', libera: pulisci(titolo) + ' ' + pulisci(artista) }
}

/** Testo normalizzato per confronti: minuscole, senza accenti né punteggiatura. */
export const normalizza = (s) =>
  String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim()

/** Primo risultato con l'artista giusto (tra gli artisti del brano), altrimenti null. */
/** true se `ago` compare in `pagliaio` come parole intere (testi già normalizzati). */
const parole = (pagliaio, ago) => ago !== '' && (' ' + pagliaio + ' ').includes(' ' + ago + ' ')

/**
 * Primo risultato con l'artista giusto, altrimenti null.
 * Artista: confronto a parole intere in tutti e due i sensi ("Tom Petty" ↔ "Tom Petty and the
 * Heartbreakers", "Johnny Cash & June Carter" ↔ "Johnny Cash"), mai "America" ↔ "American Authors".
 * Con `titolo` (ricerca libera) il titolo del risultato deve contenere quello cercato.
 */
export function scegli(items, artista, titolo = null) {
  const a = normalizza(artista)
  const tt = titolo == null ? '' : normalizza(titolo)
  if (!a) return null
  return (
    (items ?? []).find((t) => {
      if (tt && !parole(normalizza(t?.name ?? ''), tt)) return false
      return (t?.artists ?? []).some((x) => {
        const n = normalizza(x?.name ?? '')
        return n !== '' && (n === a || parole(n, a) || parole(a, n))
      })
    }) ?? null
  )
}

/**
 * Esito del redirect di login (pura, per i test): { tipo: 'ignora' } per altri percorsi,
 * { tipo: 'errore', motivo, testo } oppure { tipo: 'ok', code, testo }.
 */
export function esitoCallback(reqUrl, state, redirect = REDIRECT) {
  const atteso = new URL(redirect)
  const url = new URL(reqUrl, redirect)
  if (url.pathname !== atteso.pathname) return { tipo: 'ignora' }
  const q = url.searchParams
  if (q.get('state') !== state) return { tipo: 'errore', motivo: 'state non valido', testo: 'Stato non valido, riprova.' }
  if (q.get('error')) return { tipo: 'errore', motivo: 'login annullato: ' + q.get('error'), testo: 'Login annullato: ' + q.get('error') }
  if (!q.get('code')) return { tipo: 'errore', motivo: 'code mancante', testo: 'Risposta senza codice, riprova.' }
  return { tipo: 'ok', code: q.get('code'), testo: 'Fatto, puoi chiudere questa finestra e tornare al terminale.' }
}

/** Elenco piatto dei brani di una scaletta. */
export const brani = (pl) => pl.blocchi.flatMap((b) => b.brani.map(([artista, titolo]) => ({ artista, titolo, blocco: b.titolo })))

function leggiId() {
  return existsSync(FILE_ID) ? JSON.parse(readFileSync(FILE_ID, 'utf8')) : {}
}

function salvaId(slug, id) {
  const dati = { ...leggiId(), [slug]: id }
  writeFileSync(FILE_ID + '.tmp', JSON.stringify(dati, null, 2) + '\n')
  renameSync(FILE_ID + '.tmp', FILE_ID)
}

function apriBrowser(url) {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open'
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url]
  try {
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true })
    child.on('error', () => {}) // comando assente: l'URL è comunque stampato
    child.unref()
  } catch {
    // se non si apre, l'URL è comunque stampato
  }
}

/** Aspetta il redirect su 127.0.0.1:8888/callback e restituisce il code. */
function aspettaCodice(state, timeoutMs = 300000) {
  const u = new URL(REDIRECT)
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const e = esitoCallback(req.url, state)
      if (e.tipo === 'ignora') {
        res.writeHead(404).end()
        return
      }
      res.writeHead(e.tipo === 'ok' ? 200 : 400, { 'Content-Type': 'text/plain; charset=utf-8' }).end(e.testo)
      clearTimeout(timer)
      server.close()
      if (e.tipo === 'ok') resolve(e.code)
      else reject(new Error(e.motivo))
    })
    const timer = setTimeout(() => {
      server.close()
      reject(new Error('login non completato entro ' + timeoutMs / 60000 + ' minuti'))
    }, timeoutMs)
    server.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
    server.listen(Number(u.port), u.hostname)
  })
}

async function token(clientId, code, verifier) {
  const res = await fetch(TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT, client_id: clientId, code_verifier: verifier }),
  })
  const j = await res.json().catch(() => ({}))
  if (!res.ok || !j.access_token) throw new Error('token non ottenuto: ' + (j.error_description || j.error || res.status))
  return j.access_token
}

function client(accessToken) {
  return async function api(metodo, percorso, corpo, tentativo = 0) {
    const res = await fetch(percorso.startsWith('http') ? percorso : API + percorso, {
      method: metodo,
      headers: { Authorization: 'Bearer ' + accessToken, ...(corpo ? { 'Content-Type': 'application/json' } : {}) },
      body: corpo ? JSON.stringify(corpo) : undefined,
    })
    if (res.status === 429 && tentativo < 3) {
      const attesa = (Number(res.headers.get('retry-after')) || 2) * 1000
      await new Promise((r) => setTimeout(r, attesa))
      return api(metodo, percorso, corpo, tentativo + 1)
    }
    const j = res.status === 204 ? {} : await res.json().catch(() => ({}))
    if (!res.ok) {
      const e = new Error(metodo + ' ' + percorso + ': HTTP ' + res.status + ' ' + (j?.error?.message || ''))
      e.status = res.status
      throw e
    }
    return j
  }
}

async function cercaBrano(api, b) {
  const q = query(b.artista, b.titolo)
  for (const [testo, titolo] of [[q.stretta, null], [q.libera, b.titolo]]) {
    const j = await api('GET', '/search?' + new URLSearchParams({ q: testo, type: 'track', limit: '10', market: 'IT' }))
    // nella ricerca libera conta anche il titolo, non solo l'artista
    const t = scegli(j?.tracks?.items, b.artista, titolo)
    if (t) return t
  }
  return null
}

async function main() {
  const argv = process.argv.slice(2)
  const i = argv.indexOf('--slug')
  const slug = i >= 0 ? argv[i + 1] : Object.keys(PLAYLIST)[0]
  const pl = PLAYLIST[slug]
  if (!pl) throw new Error('nessuna scaletta per ' + slug + ' in src/playlist.js')
  const lista = brani(pl)

  if (argv.includes('--dry-run')) {
    console.log(pl.nome + ': ' + lista.length + ' brani in ' + pl.blocchi.length + ' blocchi')
    for (const b of pl.blocchi) console.log('  giorno ' + b.giorno + ' · ' + b.titolo + ': ' + b.brani.length + ' brani')
    console.log('Esempio di query: ' + query(lista[0].artista, lista[0].titolo).stretta)
    console.log('ID salvato: ' + (leggiId()[slug] || '(nessuno, verrà creata una playlist nuova)'))
    return
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID
  if (!clientId) throw new Error('SPOTIFY_CLIENT_ID mancante (vedi README, «Playlist del viaggio»)')
  const { verifier, challenge } = pkce()
  const state = b64url(randomBytes(12))
  const url = urlAutorizzazione({ clientId, challenge, state })
  const attesa = aspettaCodice(state)
  console.log('Apro il browser per il login a Spotify. Se non si apre, vai qui:\n' + url)
  apriBrowser(url)
  const code = await attesa
  const api = client(await token(clientId, code, verifier))
  const me = await api('GET', '/me')
  console.log('Collegato come ' + (me.display_name || me.id))

  const uris = []
  const mancanti = []
  for (const b of lista) {
    const t = await cercaBrano(api, b)
    if (t) uris.push(t.uri)
    else mancanti.push(b)
  }
  console.log('Trovati ' + uris.length + ' brani su ' + lista.length)

  let id = leggiId()[slug] || ''
  if (id) {
    try {
      await api('GET', '/playlists/' + id + '?fields=id')
    } catch (e) {
      if (e.status !== 404) throw e
      console.log('La playlist salvata non esiste più: ne creo una nuova')
      id = ''
    }
  }
  if (id) {
    await api('PUT', '/playlists/' + id, { name: pl.nome, description: pl.descrizione, public: true })
  } else {
    const p = await api('POST', '/me/playlists', {
      name: pl.nome, description: pl.descrizione, public: true, collaborative: false,
    })
    id = p.id
  }
  // Sostituisce tutto con il primo pezzo, poi aggiunge gli altri (max 100 per chiamata).
  const pezzi = aPezzi(uris, 100)
  await api('PUT', '/playlists/' + id + '/items', { uris: pezzi[0] ?? [] })
  for (const p of pezzi.slice(1)) await api('POST', '/playlists/' + id + '/items', { uris: p })
  salvaId(slug, id)

  console.log('Playlist pronta: https://open.spotify.com/playlist/' + id)
  console.log('ID salvato in src/spotify.json: fai build/commit per vedere il player in pagina.')
  if (mancanti.length) {
    console.log('\nBrani non trovati (' + mancanti.length + '): correggi artista o titolo in src/playlist.js')
    for (const b of mancanti) console.log('  - ' + b.artista + ' — ' + b.titolo + ' (' + b.blocco + ')')
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((e) => {
    console.error('Errore: ' + e.message)
    process.exitCode = 1
  })
}
