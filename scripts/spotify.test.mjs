import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { datiPlaylist } from '../src/costi.js'
import { GENERI, playlist } from '../src/playlist.js'
import { REDIRECT, aPezzi, brani, challengeDa, esitoCallback, normalizza, pkce, query, scegli, urlAutorizzazione } from './spotify.mjs'

const QUI = path.dirname(fileURLToPath(import.meta.url))
const ovest = playlist['ovest-2027']

test('PKCE: challenge S256 come nell’esempio della RFC 7636', () => {
  assert.equal(challengeDa('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'), 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
  const p = pkce()
  assert.match(p.verifier, /^[A-Za-z0-9_-]{43,128}$/)
  assert.equal(p.challenge, challengeDa(p.verifier))
})

test('URL di autorizzazione', () => {
  const u = new URL(urlAutorizzazione({ clientId: 'abc', challenge: 'ch', state: 'st' }))
  assert.equal(u.origin + u.pathname, 'https://accounts.spotify.com/authorize')
  assert.equal(u.searchParams.get('redirect_uri'), 'http://127.0.0.1:8888/callback')
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256')
  assert.equal(u.searchParams.get('response_type'), 'code')
  assert.equal(u.searchParams.get('state'), 'st')
  assert.equal(REDIRECT, 'http://127.0.0.1:8888/callback')
})

test('pezzi da 100', () => {
  const a = Array.from({ length: 250 }, (_, i) => i)
  assert.deepEqual(aPezzi(a).map((x) => x.length), [100, 100, 50])
  assert.deepEqual(aPezzi([]), [])
  assert.deepEqual(aPezzi([1, 2, 3], 2), [[1, 2], [3]])
})

test('query e scelta del risultato', () => {
  assert.deepEqual(query('Guns N\' Roses', 'Paradise "City"'), {
    stretta: 'track:"Paradise City" artist:"Guns N\' Roses"',
    libera: 'Paradise City Guns N\' Roses',
  })
  assert.equal(normalizza('Lùnapop'), 'lunapop')
  assert.equal(normalizza('Simon & Garfunkel'), 'simon and garfunkel')
  const items = [
    { uri: 'spotify:track:1', artists: [{ name: 'Glee Cast' }] },
    { uri: 'spotify:track:2', artists: [{ name: 'Journey' }] },
  ]
  assert.equal(scegli(items, 'Journey').uri, 'spotify:track:2')
  assert.equal(scegli(items, 'Boston'), null)
  assert.equal(scegli([{ uri: 'u', artists: [{ name: 'Mark Ronson' }, { name: 'Bruno Mars' }] }], 'Bruno Mars').uri, 'u')
})

test('scegli: artista a parole intere, duetti, titolo nella ricerca libera', () => {
  const tr = (uri, name, ...artisti) => ({ uri, name, artists: artisti.map((n) => ({ name: n })) })
  // "America" non deve prendere "American Authors"
  assert.equal(scegli([tr('a', 'Best Day of My Life', 'American Authors')], 'America'), null)
  assert.equal(scegli([tr('a', 'Best Day of My Life', 'American Authors'), tr('b', 'Ventura Highway', 'America')], 'America').uri, 'b')
  // duetti e gruppi
  assert.equal(scegli([tr('j', 'Jackson', 'Johnny Cash', 'June Carter Cash')], 'Johnny Cash & June Carter').uri, 'j')
  assert.equal(scegli([tr('w', 'Mammas Don\'t Let Your Babies Grow Up to Be Cowboys', 'Waylon Jennings', 'Willie Nelson')], 'Willie Nelson').uri, 'w')
  assert.equal(scegli([tr('t', 'American Girl', 'Tom Petty and the Heartbreakers')], 'Tom Petty').uri, 't')
  assert.equal(scegli([tr('u', 'Uptown Funk (feat. Bruno Mars)', 'Mark Ronson', 'Bruno Mars')], 'Mark Ronson').uri, 'u')
  // nomi vuoti dopo la normalizzazione non combaciano con niente
  assert.equal(scegli([tr('x', 'Qualcosa', '!!!')], 'Journey'), null)
  assert.equal(scegli([tr('x', 'Qualcosa', 'Journey')], '!!!'), null)
  // ricerca libera: anche il titolo deve esserci
  const items = [tr('k', 'Don\'t Stop Believin\' (Glee Cast Version)', 'Glee Cast'), tr('c', 'Separate Ways (Worlds Apart)', 'Journey'), tr('d', 'Don\'t Stop Believin\' - 2022 Remaster', 'Journey')]
  assert.equal(scegli(items, 'Journey').uri, 'c')
  assert.equal(scegli(items, 'Journey', 'Don\'t Stop Believin\'').uri, 'd')
  assert.equal(scegli(items, 'Journey', 'Faithfully'), null)
  assert.equal(scegli([tr('r', 'Rocket Man (I Think It\'s Going To Be A Long, Long Time)', 'Elton John')], 'Elton John', 'Rocket Man (I Think It\'s Going to Be a Long, Long Time)').uri, 'r')
})

test('esitoCallback: state, errore, codice, altri percorsi', () => {
  assert.deepEqual(esitoCallback('/favicon.ico', 's1'), { tipo: 'ignora' })
  assert.equal(esitoCallback('/callback?code=abc&state=altro', 's1').tipo, 'errore')
  assert.match(esitoCallback('/callback?code=abc&state=altro', 's1').motivo, /state/)
  const e = esitoCallback('/callback?error=access_denied&state=s1', 's1')
  assert.equal(e.tipo, 'errore')
  assert.match(e.motivo, /access_denied/)
  assert.equal(esitoCallback('/callback?state=s1', 's1').tipo, 'errore')
  assert.deepEqual(
    { ...esitoCallback('/callback?code=abc%2Fdef&state=s1', 's1'), testo: undefined },
    { tipo: 'ok', code: 'abc/def', testo: undefined },
  )
})

test('scaletta: almeno 150 brani, nessun doppione, blocchi sui tragitti in macchina', () => {
  const tutti = brani(ovest)
  assert.ok(tutti.length >= 150, String(tutti.length))
  const chiavi = tutti.map((b) => normalizza(b.artista + ' ' + b.titolo))
  assert.equal(new Set(chiavi).size, chiavi.length)
  for (const b of ovest.blocchi) for (const [a, t, g] of b.brani) assert.ok(a && t && GENERI[g], a + ' ' + t + ' ' + g)
  // giorni con tragitti in comune nel programma: 2, 4, 5, 8, 12, 14
  assert.deepEqual(ovest.blocchi.map((b) => b.giorno), [2, 4, 5, 8, 12, 14])
  assert.deepEqual(Object.keys(GENERI).filter((g) => tutti.length && ovest.blocchi.some((b) => b.brani.some((x) => x[2] === g))), Object.keys(GENERI))
})

test('datiPlaylist: ID accettato solo se valido', () => {
  assert.equal(datiPlaylist(ovest, '37i9dQZF1DXcBWIGoYBM5M').spotify, '37i9dQZF1DXcBWIGoYBM5M')
  assert.equal(datiPlaylist(ovest, '').spotify, null)
  assert.equal(datiPlaylist(ovest, '"><script>').spotify, null)
  assert.equal(datiPlaylist(null, 'x'), null)
  assert.deepEqual(datiPlaylist(ovest, '').blocchi[0].brani[0], { artista: 'John Denver', titolo: 'Rocky Mountain High', genere: 'classici' })
})

test('CLI --dry-run senza rete', () => {
  const r = spawnSync(process.execPath, [path.join(QUI, 'spotify.mjs'), '--dry-run'], { encoding: 'utf8', env: { ...process.env, SPOTIFY_CLIENT_ID: '' } })
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stdout, /\d{3} brani in 6 blocchi/)
})
