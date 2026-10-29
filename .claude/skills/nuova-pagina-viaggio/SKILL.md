---
name: nuova-pagina-viaggio
description: Crea un nuovo itinerario (o una variante di uno esistente) nel sito veralfre/viaggi: pagina statica in public/<slug>/ con mappa SVG, programma giorno per giorno, sentieri con km e dislivelli, alternative pigre, calendario, e la sua configurazione in src/viaggi.js per i bot dei prezzi (voli e case su SerpApi), il conto diviso per coppie e la playlist. Usala quando l'utente dice "crea un viaggio", "nuovo itinerario", "fammi la pagina per <posto>", "versione corta/lunga di <viaggio>", "aggiungi un viaggio al sito" o "/nuova-pagina-viaggio". Esempi svolti: ovest-2027 (15 giorni Denver → Bozeman) e ovest-2027-short (10 giorni Jackson Hole → Bozeman).
---

# Nuova pagina di viaggio

Il sito (README.md del repo, da leggere per primo) ha una home React che elenca `src/viaggi.js`
e una pagina HTML statica per viaggio in `public/<slug>/index.html`. Tutto è in italiano,
con il tono delle pagine esistenti: seconda persona plurale agli ospiti, «io guido», ironia
leggera, niente gergo tecnico. Questo è un progetto personale: niente Jira né Kimai, commit
con messaggi semplici, push come veralfre (vedi «Pubblicare»).

## 1. Prima di tutto: le decisioni dell'utente

Chiedile insieme (AskUserQuestion, opzione consigliata per prima) prima di pianificare:

- **Date esatte** con il giorno della settimana. Calcola sempre il giorno della settimana
  dell'anno giusto (es. il 15/7/2027 è giovedì): l'utente può sbagliarlo, e se lo nomina
  vince il vincolo che c'è dietro (es. «a casa per lavorare sabato mattina» → il volo
  di ritorno atterra al più tardi venerdì; i voli notturni verso l'Europa atterrano il
  giorno dopo).
- **Aeroporti** di arrivo e partenza (open-jaw = noleggio solo andata), eventuali scenari
  alternativi da confrontare solo nei prezzi (`voli.alternative`).
- **Chi viaggia da dove**: quanti volano dall'Italia (aeroporti di partenza e costi di
  accesso), chi li raggiunge da altrove (`voli.ospiti`, voli di sola andata), quante coppie
  dividono il conto.
- **Basi per la notte** (di norma 3 notti per base; l'ultima notte vicino all'aeroporto se
  il volo è presto) e ritmo (giorni leggeri all'inizio se c'è quota).
- **Playlist**: nuova o la stessa di un altro slug (`playlistDi`).
- Per una variante di un viaggio esistente: cosa succede a quello vecchio (di solito
  `attivo: false` per voli e alloggi, `nota` sulla scheda in home, una riga in pagina che
  rimanda alla versione nuova; la pagina resta online).

Per lavori grandi segui il flusso Plan → Implement → Review delle istruzioni globali: un
planner scrive il piano in un file, le risposte dell'utente vanno in testa come sezione
vincolante, due implementatori in parallelo (A: config, bot, test, README; B: la pagina,
che è di B per intero), poi una revisione e la verifica finale fatta dall'orchestratore.

## 2. Configurazione in `src/viaggi.js`

Copia la voce più simile e adattala. Campi (dettagli nel README):

- `slug`, `titolo`, `date`, `luoghi`, `nota` (facoltativa, in home), `playlistDi`.
- `voli`: `attivo`, `adulti`, `andata` / `ritorno` (`da`, `a`, `date` flessibili),
  `accesso` (auto + parcheggio per aeroporto italiano), `ospiti` (lista di tratte di sola
  andata `{ id, voce, adulti, da, a, date }`), `alternative` (`{ id, nome, descrizione,
  andata, ritorno, ospiti }`, CSV `voli-<id>.csv`).
- `alloggi`: `adulti`, `camere`, `bagni`, `fonti`, `paese`, `raggioKm`, `tappe` con
  `centro` [lat, lon], `dal`/`al` consecutivi, `nota`, `vicino`.
- `costi`: `coppie`, `noleggio` (`importo: null` = «da definire» finché l'utente non dà un
  preventivo; il noleggio si divide tra le coppie), `carburante` (`km`, `litriPer100` ~12,5
  per un SUV da 7 posti carico, `euroLitro`; la benzina la paga chi ospita), `extra`,
  `alternative.<id>` (noleggio e km dello scenario).

**Budget SerpApi** (250 ricerche al mese per chiave, al massimo 16 esecuzioni al mese):
voli = per scenario `coppie di date + aeroporti di partenza + tratte ospiti`; alloggi =
`tappe × fonti`. Controlla con `npm run voli:dry` e `npm run alloggi:dry` e resta sotto
220 (soglia di avviso) lasciando qualche esecuzione manuale. Disattiva i viaggi vecchi per
liberare budget. Esempio: ovest-2027-short = 13/208 voli, 8/128 alloggi.

## 3. La pagina `public/<slug>/index.html`

Parti da una copia dell'ultima pagina esistente e sostituisci i blocchi, senza riscrivere
lo stile. Blocchi del primo `<script>`:

- **Proiezione e mappa**: `W,H,LON0,LAT1,KX,KY`, `P(lat,lon)`. `BASE` (strade, fiumi, laghi,
  parchi, confini, città; Natural Earth) copre lat 37.9–47.5 e lon -114…-100: dentro
  quest'area si riusa così com'è e l'hero fa solo uno zoom con un viewBox (vedi
  ovest-2027-short: `HERO_VB`, `setVB(v, svg)`, riquadro «Dove siamo negli USA»
  riposizionato, scala ricalcolata con `KX/(111.32·cos lat)`). Fuori da quest'area servono
  nuovi layer: scaricali da Natural Earth e proiettali con la stessa formula.
- **`PL`**: luoghi `{n, c:[lat,lon], s:"l|r|t|b"}` (lato dell'etichetta).
- **`ROUTES`**: `days` (una polilinea per giorno, `[lat,lon]` a 3 decimali, ~40 punti) e
  `full`, da OSRM pubblico:
  `https://router.project-osrm.org/route/v1/driving/<lon,lat;lon,lat;...>?overview=simplified&geometries=geojson`
  (inverti in lat/lon). I km di ogni giorno vanno nei testi (`km` di `DAYS`) e la somma in
  `costi.carburante.km`.
- **`DAYS`**: `{wd, reg, t, path, stops, night, km, notte, txt, clou, tip, ab, foto, film}`;
  `dateOf = i => new Date(anno, mese-1, giornoIniziale+i)`; `wd` coerenti con le date.
- **`PROG`**: per giorno una lista di voci `[slot, titolo, testo, abbigliamento, foto, opzioni]`,
  con `opzioni = { tk: [id dei sentieri], pigra: "alternativa pigra" }` (facoltativo).
- **`TREK`**: sentieri `{nome, tipo, km, su, giu, quotaMin, quotaMax, pts, tappe}`. Come
  ottenerli: traccia da OpenStreetMap con Overpass (`POST https://overpass-api.de/api/interpreter`,
  serve un header User-Agent, altrimenti 406), quote dal modello USGS 3DEP a 1 m
  (`https://epqs.nationalmap.gov/v1/json?x=<lon>&y=<lat>&units=Meters&wkid=4326`, un punto per
  chiamata; fuori dagli USA Open-Meteo `api.open-meteo.com/v1/elevation`, 90 m). Ricampiona ogni
  10–20 m, liscia, isteresi ~3 m per salita e discesa; `km` totali (andata e ritorno compresi),
  `pts` solo andata per gli andata e ritorno. Confronta con la cifra ufficiale (NPS) e annota
  le differenze oltre il 20%. Etichette delle tappe in italiano, `s` dove si sovrappongono.
- **Calendario**: `CAL_OFF` (giorno della settimana del primo giorno, lunedì = 0), data di
  inizio della griglia, `EV` (barre per regione e per notti).
- Testi: hero (titolo, intro, facts con date, parchi, km, basi), legenda e colori per
  regione, schede dei parchi, «Cose pratiche» (voli e documenti, auto, ingressi, meteo,
  animali, quota, **«Fiato e gambe»**, da prenotare), lede delle sezioni prezzi.

**Promessa «Fiato e gambe»** (decisa dall'utente): la forma fisica non esclude nessuno da
niente. Ogni attività a piedi ha un'alternativa pigra 🛋 vicina al parcheggio (c'è un solo
SUV), sentieri lunghi solo come «Facoltativo», giorni lunghi in auto con una «versione
leggera». Ogni sentiero nel programma ha km e dislivelli veri e si apre sulla mappa.

Il secondo `<script>` (prezzi, alloggi, conto, playlist) è generico: legge
`voli.csv`, `voli-<id>.csv`, `alloggi.csv` e `viaggio.json` accanto alla pagina. Copialo
dall'ultima pagina; aggiungi i nomi dei nuovi aeroporti in `LUOGHI`.

Home: niente da fare oltre alla voce in `src/viaggi.js` (l'ordine dell'array è l'ordine
delle schede). Playlist: blocchi in `src/playlist.js` per slug (`giorno` = numero del
giorno nel programma).

## 4. Divieti

- Mai scrivere a mano `public/*/voli*.csv`, `public/*/alloggi.csv` (li scrive il bot, la
  storia non si cancella) né `src/spotify.json` (ID reali).
- Mai creare `public/<slug>/viaggio.json`: lo genera la build (la build si ferma se lo trova).
- Script di appoggio (OSRM, Overpass, quote, assemblaggio della pagina) nello scratchpad,
  non nel repo; Python con `-I`.

## 5. Test e verifica

- I test (`scripts/*.test.mjs`) leggono la configurazione vera: per un viaggio disattivato
  usano una copia «riattivata per i test». Aggiungi test per il nuovo slug: tappe
  consecutive e notti, budget (dry-run), scenari e CSV, `datiPagina`, playlist.
- `npm test`, `npm run lint`, `npm run build`, `npm run voli:dry`, `npm run alloggi:dry`.
- Anteprima con dati finti: `npm run build`, poi
  `VOLI_NOW=<oggi>T05:17:00Z node scripts/voli.mjs --fixture scripts/fixtures/voli --out dist`
  e lo stesso con `alloggi.mjs`, poi `npx vite preview`. Con le fixture tutti i voli
  risultano verso DEN: le tratte con altri aeroporti mostrano «da rilevare», è normale.
- Screenshot headless con Chrome di sistema (`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`,
  playwright con `executablePath`) a 1300 e 390 px: hero, ogni `#giorno-N`, zoom di ogni
  sentiero (etichette che non escono dal bordo e non si sovrappongono), calendario, conto,
  home. Console senza errori (il 404 di favicon e dei CSV che mancano è atteso).

## 6. Pubblicare

- `git pull` prima di iniziare e prima del commit (il bot committa i CSV ogni due giorni).
- Commit con messaggio semplice in italiano e la riga `Co-Authored-By` del sistema, push:
  il repo ha già identità e credenziali di veralfre. Per `gh` usa
  `GH_TOKEN=$(gh auth token --user veralfre) gh ... -R veralfre/viaggi`.
- `gh run watch` sul deploy, poi `gh workflow run voli.yml` per la prima rilevazione dei
  prezzi del nuovo viaggio (crea i suoi CSV); controlla il budget delle esecuzioni manuali.
- Alla fine riassumi all'utente cosa resta da fare a mano (preventivo del noleggio, playlist
  Spotify da creare con `scripts/spotify.mjs`, cifre ufficiali da verificare).
