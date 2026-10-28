import react from '@vitejs/plugin-react'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import { datiPagina } from './src/costi.js'
import { GENERI, playlist } from './src/playlist.js'
import { viaggi } from './src/viaggi.js'

// Genera /<slug>/viaggio.json (accesso aeroporti, tappe, extra) per ogni viaggio
// con voli, alloggi, costi o playlist (src/playlist.js, ID in src/spotify.json):
// la pagina lo legge accanto a sé.
function datiViaggi() {
  const lista = viaggi.filter((v) => v.voli || v.alloggi || v.costi || playlist[v.slug])
  const fileSpotify = resolve(import.meta.dirname, 'src', 'spotify.json')
  const spotify = () => (existsSync(fileSpotify) ? JSON.parse(readFileSync(fileSpotify, 'utf8')) : {})
  const json = (v) =>
    JSON.stringify(datiPagina(v, { playlist: playlist[v.slug], spotify: spotify()[v.slug], generi: GENERI }), null, 2) + '\n'
  return {
    name: 'dati-viaggi',
    buildStart() {
      for (const v of lista) {
        if (existsSync(resolve(import.meta.dirname, 'public', v.slug, 'viaggio.json'))) {
          this.error('public/' + v.slug + '/viaggio.json non va scritto a mano: lo genera la build da src/viaggi.js')
        }
      }
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url || '').split('?')[0]
        const v = lista.find((x) => url === '/viaggi/' + x.slug + '/viaggio.json' || url === '/' + x.slug + '/viaggio.json')
        if (!v) return next()
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(json(v))
      })
    },
    generateBundle() {
      for (const v of lista) this.emitFile({ type: 'asset', fileName: v.slug + '/viaggio.json', source: json(v) })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), datiViaggi()],
  // Il sito è servito da GitHub Pages su https://veralfre.github.io/viaggi/
  base: '/viaggi/',
  build: {
    rollupOptions: {
      // Pagine compilate da Vite. Le pagine HTML statiche in public/ vengono
      // copiate così come sono e non vanno elencate qui.
      //
      // Per aggiungere un viaggio scritto in React come pagina separata:
      //   1. crea la cartella, es. nuovo-viaggio/, con un index.html che
      //      carica il suo script (<script type="module" src="./main.jsx">);
      //   2. aggiungi qui la voce:
      //        'nuovo-viaggio': resolve(import.meta.dirname, 'nuovo-viaggio/index.html'),
      //   3. aggiungi il viaggio in src/viaggi.js.
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
      },
    },
  },
})
