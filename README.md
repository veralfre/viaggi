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

Il repo è la fonte di verità: si modifica direttamente `public/<slug>/index.html`, non si ricopia più da `~/Downloads`. Prima di iniziare scarica le novità, perché il bot dei prezzi voli committa `voli.csv` ogni due giorni:

```sh
git pull
# modifica public/ovest-2027/index.html
git add public/ovest-2027/index.html
git commit -m "Aggiorna itinerario Ovest 2027"
git push
gh run watch
```

Il deploy parte da solo a ogni push su `main`.

## Storico prezzi voli

Ogni due giorni il workflow `.github/workflows/voli.yml` cerca su Google Flights (tramite [SerpApi](https://serpapi.com/google-flights-api)) i prezzi dei voli dei viaggi attivi, aggiunge le righe a `public/<slug>/voli.csv`, committa e ripubblica il sito. La pagina del viaggio legge il proprio CSV e mostra prezzo a persona e per coppia, compagnia, scali e durata dell'opzione più economica, il grafico dell'andamento e la tabella dei prezzi per combinazione di date.

### Configurazione

Si attiva per viaggio in `src/viaggi.js`, con il campo `voli`:

```js
voli: {
  attivo: true,          // false (o campo assente) = non si cerca
  adulti: 4,             // quante persone volano dall'Italia
  andata:  { da: ['BLQ', 'MXP', 'VCE'], a: ['DEN'], date: ['2027-07-16', '2027-07-17', '2027-07-18'] },
  ritorno: { da: ['BZN'], a: ['BLQ', 'MXP', 'VCE'], date: ['2027-07-30', '2027-07-31', '2027-08-01'] },
}
```

Gli aeroporti di una tratta vanno in un'unica ricerca (Google Flights li raggruppa). Si cerca ogni coppia andata × ritorno (con il ritorno dopo l'andata), più una ricerca per i dettagli del ritorno dell'opzione più economica. Le date di andata già passate non si cercano più (e il budget scende di conseguenza); i viaggi con tutte le andate passate vengono saltati da soli; quando il viaggio è fatto, mettete comunque `attivo: false`. Possono essere attivi più viaggi insieme.

### Budget

Il piano gratuito di SerpApi ha **250 ricerche al mese**, condivise tra tutti i viaggi attivi. Ogni viaggio costa `(coppie di date + 1)` ricerche per esecuzione, e le esecuzioni sono al massimo 16 al mese: Ovest 2027 = 10 × 16 = 160. Sopra 200 lo script avvisa, sopra 250 si ferma prima di fare qualunque chiamata. Per controllare il piano senza chiave e senza chiamate:

```sh
npm run voli:dry
```

### Esecuzione manuale e calibrazione

```sh
gh workflow run voli.yml                 # una rilevazione subito
gh workflow run voli.yml -f calibra=true # verifica se il prezzo di Google è totale o a persona (2 ricerche, non scrive)
```

Lo script assume che il prezzo restituito sia il **totale** per tutti gli adulti e lo divide (`PREZZO_BASE` in `scripts/voli.mjs`). La calibrazione confronta la stessa ricerca con N adulti e con 1 adulto e dice se va cambiato.

La chiave sta nel secret del repo `SERPAPI_KEY` (Settings → Secrets and variables → Actions). In locale la chiave non serve: i test usano le risposte salvate in `scripts/fixtures/voli/`.

```sh
npm test
# CSV di prova in una cartella temporanea, senza chiamate reali:
VOLI_NOW=2026-10-28T05:17:00Z node scripts/voli.mjs --fixture scripts/fixtures/voli --out /tmp/voli-prova
```

GitHub disattiva i workflow schedulati dopo **60 giorni senza attività** nel repo: se succede, riattivatelo dalla scheda Actions (o con `gh workflow enable voli.yml`).

### Aggiungere la sezione a un'altra pagina

Copiate da `public/ovest-2027/index.html` il blocco CSS `/* Fares */`, la sezione `<section id="voli">` (adattando il testo introduttivo) e il secondo `<script>` in fondo alla pagina: non contiene niente di specifico per Ovest e legge il file indicato in `data-csv="voli.csv"`, accanto alla pagina. Finché il CSV non esiste la pagina mostra un messaggio d'attesa.

### Colonne di `voli.csv`

Una riga per ogni opzione restituita, mai cancellata (lo storico cresce a ogni esecuzione).

| Colonna | Significato |
| --- | --- |
| `run` | data e ora UTC dell'esecuzione, uguale per tutte le sue righe |
| `tipo` | `andata` (ricerche per coppia di date) o `ritorno` (dettagli del ritorno dell'opzione più economica) |
| `data_andata`, `data_ritorno` | coppia di date cercata |
| `sezione`, `rango` | `best` o `other` di Google Flights e posizione nella lista |
| `prezzo`, `valuta` | prezzo restituito per l'intero itinerario |
| `adulti`, `base` | persone cercate; `totale` o `persona` (come interpretare `prezzo`) |
| `prezzo_persona` | prezzo a persona |
| `compagnie`, `voli` | compagnie e numeri di volo della tratta |
| `scali`, `aeroporti_scalo`, `durata_min` | numero di scali, aeroporti di scalo, durata totale in minuti |
| `da`, `a`, `partenza`, `arrivo` | aeroporti e orari locali di partenza e arrivo della tratta |
| `migliore` | `1` sull'andata usata per i dettagli del ritorno e sul ritorno più economico |
