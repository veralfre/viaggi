import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
