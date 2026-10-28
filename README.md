# Viaggi

Itinerari di viaggio pubblicati su GitHub Pages: https://veralfre.github.io/viaggi/

Home in React (Vite) che elenca i viaggi di `src/viaggi.js`. A ogni push su `main` il workflow `.github/workflows/deploy.yml` compila e pubblica il sito.

```sh
npm install
npm run dev      # sviluppo locale
npm run build    # build in dist/
```

## Aggiungere un viaggio HTML statico

1. Crea la cartella `public/<slug>/` e mettici dentro il file come `index.html` (viene copiato senza modifiche).
2. Aggiungi la voce in `src/viaggi.js`:
   ```js
   { slug: '<slug>', titolo: '…', date: '…', luoghi: '…' }
   ```

## Aggiungere un viaggio in React

1. Crea la cartella `<slug>/` nella radice del progetto con un `index.html` e il suo script (es. `main.jsx`).
2. Aggiungi la pagina a `build.rollupOptions.input` in `vite.config.js` (c'è un commento con l'esempio).
3. Aggiungi la voce in `src/viaggi.js`.

Se serve un router, usa **`HashRouter`** di React Router: GitHub Pages non conosce le rotte lato client e con `BrowserRouter` ricaricare una sottopagina darebbe 404.

## Aggiornare una pagina esistente

Sostituisci il file e pubblica, es. per l'itinerario Ovest:

```sh
cp ~/Downloads/viaggio-ovest.html public/ovest-2027/index.html
git add public/ovest-2027/index.html
git commit -m "Aggiorna itinerario Ovest 2027"
git push
```

Il deploy parte da solo; segui l'avanzamento con `gh run watch`.
