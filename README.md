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

Il repo è la fonte di verità: si modifica direttamente `public/<slug>/index.html`, non si ricopia più da `~/Downloads`. Prima di iniziare scarica le novità, perché il bot dei prezzi committa `voli.csv` e `alloggi.csv` ogni due giorni:

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

Ogni due giorni il workflow `.github/workflows/voli.yml` («Prezzi voli e alloggi») cerca su Google Flights (tramite [SerpApi](https://serpapi.com/google-flights-api)) i prezzi dei voli dei viaggi attivi, aggiunge le righe a `public/<slug>/voli.csv`, fa lo stesso per gli alloggi (vedi sotto), committa e ripubblica il sito. La pagina del viaggio legge il proprio CSV e mostra il costo reale a persona e per coppia (biglietto andata e ritorno verificato più accesso all'aeroporto), compagnia, scali e durata, la tabella «Itinerari per aeroporto» (tutti gli aeroporti di partenza: verificato se c'è un itinerario andata e ritorno dallo stesso aeroporto, altrimenti il prezzo «a partire da» segnato con un asterisco), il grafico dell'andamento e la tabella dei prezzi «a partire da» per combinazione di date.

### Configurazione

Si attiva per viaggio in `src/viaggi.js`, con il campo `voli`:

```js
voli: {
  attivo: true,          // false (o campo assente) = non si cerca
  adulti: 4,             // quante persone volano dall'Italia
  andata:  { da: ['BLQ', 'MXP', 'VCE'], a: ['DEN'], date: ['2027-07-14', '2027-07-15', '2027-07-16'] },
  ritorno: { da: ['BZN'], a: ['BLQ', 'MXP', 'VCE'], date: ['2027-07-28', '2027-07-29'] },
  accesso: { MXP: { auto: 55, parcheggio: 120 }, … },  // vedi «Costo reale e accesso agli aeroporti»
}
```

Gli aeroporti di una tratta vanno in un'unica ricerca (Google Flights li raggruppa). Si cerca ogni coppia andata × ritorno (con il ritorno dopo l'andata). Il prezzo di queste ricerche è solo «a partire da»: Google mostra il prezzo dell'andata con il ritorno più economico possibile, che spesso non esiste davvero o arriva in un altro aeroporto. Per questo, **per ogni aeroporto di partenza**, lo script prende l'andata più economica da lì (tra tutte le coppie di date) e chiede i ritorni di quell'itinerario (`departure_token`): quello è il prezzo vero, andata e ritorno. Andata e ritorni di uno stesso follow-up hanno lo stesso numero nella colonna `gruppo`. Gli itinerari con ritorno in un aeroporto diverso da quello di partenza non si considerano (l'auto resterebbe all'altro aeroporto). Le date di andata già passate non si cercano più (e il budget scende di conseguenza); i viaggi con tutte le andate passate vengono saltati da soli; quando il viaggio è fatto, mettete comunque `attivo: false`. Possono essere attivi più viaggi insieme.

### Budget

Il piano gratuito di SerpApi ha **250 ricerche al mese**, condivise tra tutti i viaggi attivi. Ogni viaggio costa `(coppie di date + aeroporti di partenza + date del rientro di chi ospita)` ricerche per esecuzione, e le esecuzioni sono al massimo 16 al mese: Ovest 2027 = (6 + 3 + 1) × 16 = 160. Restano 90 ricerche al mese: circa **9 esecuzioni manuali** (`gh workflow run`, 10 ricerche ciascuna). Gli alloggi hanno una chiave e un budget separati. Sopra 220 lo script avvisa, sopra 250 si ferma prima di fare qualunque chiamata. Per controllare il piano senza chiave e senza chiamate:

```sh
npm run voli:dry
```

### Volo di rientro di chi ospita

Chi ospita vive a Denver: a fine viaggio consegna il SUV a Bozeman e torna a casa in aereo. Con `voli.rientroOspiti` lo script fa anche una ricerca di **solo andata** (Google Flights `type=2`) per quel volo, sulla stessa chiave dei voli:

```js
rientroOspiti: { attivo: true, adulti: 2, da: ['BZN'], a: ['DEN'], date: ['2027-07-29'] },
```

Le opzioni finiscono in `voli.csv` come righe `tipo=rientro` (stesse colonne, nessuna colonna nuova; `prezzo` è il totale per gli adulti indicati e `prezzo_persona` la quota a testa; `migliore=1` sulla più economica). Se la ricerca fallisce è solo un avviso. La pagina le ignora per andata, ritorno e «a partire da», e le usa per una riga nella sezione voli e per la riga «Volo di rientro» del conto, a carico della coppia che ospita.

### Esecuzione manuale e calibrazione

```sh
gh workflow run voli.yml                 # una rilevazione subito, voli e alloggi
gh workflow run voli.yml -f cosa=voli    # solo voli (oppure -f cosa=alloggi)
gh workflow run voli.yml -f calibra=true # verifica se il prezzo di Google è totale o a persona (2 ricerche, non scrive, salta gli alloggi)
```

Lo script assume che il prezzo restituito sia il **totale** per tutti gli adulti e lo divide (`PREZZO_BASE` in `scripts/voli.mjs`). La calibrazione confronta la stessa ricerca con N adulti e con 1 adulto e dice se va cambiato.

La chiave sta nel secret del repo `SERPAPI_KEY` (Settings → Secrets and variables → Actions). In locale la chiave non serve: i test usano le risposte salvate in `scripts/fixtures/voli/`.

```sh
npm test
# CSV di prova in una cartella temporanea, senza chiamate reali:
VOLI_NOW=2026-10-28T05:17:00Z node scripts/voli.mjs --fixture scripts/fixtures/voli --out /tmp/voli-prova
```

GitHub disattiva i workflow schedulati dopo **60 giorni senza attività** nel repo: se succede, riattivatelo dalla scheda Actions (o con `gh workflow enable voli.yml`).

### Aggiungere le sezioni a un'altra pagina

Copiate da `public/ovest-2027/index.html` i blocchi CSS `/* Fares */` e `/* Stays & totale */`, le tre sezioni `<section id="voli">`, `<section id="alloggi">` e `<section id="totale">` (adattando i testi introduttivi) con i loro contenitori `#fares` (`data-csv="voli.csv" data-config="viaggio.json"`), `#stays` (`data-csv="alloggi.csv"`) e `#tot`, e il secondo `<script>` in fondo alla pagina: non contiene niente di specifico per Ovest e legge i file accanto alla pagina. Ogni sezione si arrangia da sola: finché un file non esiste mostra un messaggio d'attesa, e le sezioni che mancano vengono ignorate. Per la playlist servono anche la sezione `<section id="playlist">` con il contenitore `#pl` e il blocco CSS `/* Playlist */`: la scaletta arriva da `viaggio.json` (generato dalla build per gli slug con una voce in `src/playlist.js`); senza `viaggio.json`, per esempio aprendo il file in locale, la sezione mostra solo un messaggio d'attesa, e senza un ID valido in `src/spotify.json` mostra la scaletta senza player.

### Colonne di `voli.csv`

Una riga per ogni opzione restituita, mai cancellata (lo storico cresce a ogni esecuzione).

| Colonna | Significato |
| --- | --- |
| `run` | data e ora UTC dell'esecuzione, uguale per tutte le sue righe |
| `tipo` | `andata` (ricerche per coppia di date), `ritorno` (dettagli del ritorno dell'opzione più economica) o `rientro` (volo di solo andata di chi ospita: `data_andata` = data del volo, `data_ritorno` e `gruppo` vuoti) |
| `data_andata`, `data_ritorno` | coppia di date cercata |
| `sezione`, `rango` | `best` o `other` di Google Flights e posizione nella lista |
| `prezzo`, `valuta` | prezzo restituito per l'intero itinerario |
| `adulti`, `base` | persone cercate; `totale` o `persona` (come interpretare `prezzo`) |
| `prezzo_persona` | prezzo a persona |
| `compagnie`, `voli` | compagnie e numeri di volo della tratta |
| `scali`, `aeroporti_scalo`, `durata_min` | numero di scali, aeroporti di scalo, durata totale in minuti |
| `da`, `a`, `partenza`, `arrivo` | aeroporti e orari locali di partenza e arrivo della tratta |
| `migliore` | `1` sull'andata più economica di ogni aeroporto (quella usata per chiedere i ritorni) e, per ogni gruppo, sul ritorno più economico verso lo stesso aeroporto di partenza |
| `gruppo` | numero dell'itinerario verificato (andata + ritorni dello stesso follow-up); vuoto sulle altre righe. Le righe della prima versione del CSV (senza questa colonna) vengono migrate con il campo vuoto e la pagina le legge come un unico gruppo |

## Costo reale e accesso agli aeroporti

Il costo mostrato in pagina è il **biglietto andata e ritorno verificato** più l'**accesso all'aeroporto**: un'auto da Bologna per i quattro che volano, andata, parcheggio per tutto il soggiorno e ritorno, diviso per quattro. Si confrontano solo itinerari che partono e tornano allo stesso aeroporto. Le stime stanno in `src/viaggi.js`, in `voli.accesso` (`auto` = carburante e pedaggi per una tratta, per l'auto intera; `parcheggio` = tutto il soggiorno): oggi MXP 57,50 €/persona, VCE 41,50 €, BLQ 0. I costi di accesso non finiscono nel CSV (che resta un dato di mercato grezzo): la build genera `/<slug>/viaggio.json` da `src/viaggi.js` (plugin `dati-viaggi` in `vite.config.js`, calcoli in `src/costi.js`), e la pagina lo legge accanto a sé. Non va creato a mano in `public/`: la build si ferma se lo trova.

## Storico prezzi alloggi

Nello stesso workflow, `scripts/alloggi.mjs` cerca **case intere** su Airbnb e Booking.com (tramite SerpApi, motori [`airbnb`](https://serpapi.com/airbnb-search-api) e [`booking`](https://serpapi.com/booking-search-api)) per ogni tappa del viaggio e aggiunge tutte le strutture adatte a `public/<slug>/alloggi.csv`. La pagina mostra per ogni tappa la casa più economica tra le due fonti, l'andamento e la somma di tutte le tappe.

Configurazione in `src/viaggi.js`:

```js
alloggi: {
  attivo: true,
  adulti: 6, camere: 3, bagni: 2,   // minimi: una camera per coppia, due bagni
  paese: 'us',                       // Booking: scarta risultati in altri paesi
  raggioKm: 25,                      // solo case entro 25 km dal centro della tappa
  fonti: ['airbnb', 'booking'],
  tappe: [
    { id: 'denver', nome: 'Denver', q: 'Denver, Colorado, USA', centro: [39.7392, -104.9903], dal: '2027-07-15', al: '2027-07-16' },
    // …; facoltativi: `raggioKm` (per tappa), `vicino` (nome del posto da cui si misura la distanza
    // in pagina, es. «West Yellowstone»), `nota` (mostrata nella scheda della tappa)
  ],
}
```

- **Airbnb** filtra lato API: `room_type=entire_home`, `bedrooms` e `bathrooms` minimi. Il prezzo è quello di tutto il soggiorno.
- **Booking.com** non ha filtri su camere e bagni: si chiede un'unica unità per sei (`rooms=1`) tra appartamenti e case vacanza (`property_types=201,220`) e lo script tiene solo le strutture che dichiarano almeno 3 camere e 2 bagni nella somma di `rooms[]`. Quelle che non li dichiarano vengono scartate.
- **Vicino alla tappa:** con `centro: [lat, lon]` lo script calcola la distanza di ogni casa dalle sue coordinate (`gps_coordinates` di entrambe le fonti) e scarta quelle oltre `raggioKm` (della tappa, altrimenti `alloggi.raggioKm`, di default 25), con un avviso per fonte su quante ne ha scartate. Scarta anche le strutture senza coordinate, di entrambe le fonti (di norma ci sono sempre). Su Airbnb la ricerca è già limitata al riquadro attorno al centro (`map_bounds`, nord,est,sud,ovest, insieme a `q`). In pagina ogni scheda mostra «a X km da …». Serve dopo che per West Yellowstone era uscita una casa in Idaho e per Gardiner una in Nuova Zelanda.
- Le tappe già iniziate non si cercano più.

Chiave e **budget separati** dai voli: secret `SERPAPI_KEY_ALLOGGI`, 250 ricerche al mese. Ogni viaggio costa `tappe × fonti` ricerche per esecuzione: Ovest 2027 = 6 × 2 × 16 = 192 al mese; anche qui restano circa 4 esecuzioni manuali al mese.

```sh
npm run alloggi:dry
ALLOGGI_NOW=2026-10-28T05:17:00Z node scripts/alloggi.mjs --fixture scripts/fixtures/alloggi --out /tmp/alloggi-prova
gh workflow run voli.yml -f cosa=alloggi
```

### Colonne di `alloggi.csv`

| Colonna | Significato |
| --- | --- |
| `run` | data e ora UTC dell'esecuzione |
| `fonte` | `airbnb` o `booking` |
| `tappa`, `luogo`, `check_in`, `check_out`, `notti` | tappa cercata (id e nome da `src/viaggi.js`) |
| `adulti`, `camere_min`, `bagni_min` | criteri della ricerca |
| `rango` | posizione tra le strutture adatte di quella ricerca |
| `nome`, `tipo` | nome dell'annuncio e tipo (es. «Home in Jackson», «Entire home») |
| `totale`, `a_notte`, `tasse`, `valuta` | prezzo per tutto il soggiorno, media a notte (da Booking se la dà, altrimenti totale ÷ notti), tasse e spese se indicate |
| `camere`, `bagni`, `letti`, `ospiti` | come dichiarati dall'annuncio (vuoti se mancano) |
| `valutazione`, `scala`, `recensioni` | voto nella scala della fonte (5 per Airbnb, 10 per Booking) e numero di recensioni |
| `info` | note della fonte (es. «for 3 nights», disponibilità) |
| `link`, `id` | link all'annuncio (solo https) e id della fonte |
| `lat`, `lon`, `distanza_km` | coordinate della casa e distanza in km dal centro della tappa (vuote se la fonte non le dà). Le righe della prima versione del CSV, senza queste colonne, vengono migrate con i campi vuoti; la pagina le usa solo finché per quella tappa non ci sono righe nuove con la distanza |

## Totale indicativo

La sezione «Il conto, più o meno» somma, per la coppia che vola dall'Italia, due biglietti verificati, due quote di accesso all'aeroporto, un terzo delle case, del noleggio del SUV e degli extra; per la coppia che ospita, il volo di rientro Bozeman → Denver (se configurato; «da rilevare» finché non c'è un prezzo), tutta la benzina, un terzo delle case, del noleggio e degli extra. Per ogni voce la tabella mostra la cifra per coppia e quella a persona (metà). Il numero di coppie sta in `costi.coppie`.

SerpApi non ha un motore per il noleggio auto (nemmeno su Booking), quindi noleggio e benzina sono a mano in `src/viaggi.js`:

```js
costi: {
  coppie: 3,
  noleggio: {
    voce: 'Noleggio SUV 7 posti, Denver → Bozeman (16–29 luglio)', importo: 1816,
  },
  carburante: { km: 2300, litriPer100: 12.5, euroLitro: 0.85 },  // stima, offre chi ospita
  extra: [],  // altre voci { voce, importo } divise tra le coppie
}
```

La build calcola la benzina (`km × litriPer100 / 100 × euroLitro`) e la mette in `viaggio.json` con il noleggio (che finisce tra gli extra). Gli extra con `importo: null` restano «da definire» e fuori dalla somma, e il totale è marcato parziale finché manca qualcosa (tappe senza prezzo, ritorno non verificato, rientro da rilevare, extra da definire). Non compresi: pasti, attività e ingressi a pagamento, ESTA, assicurazione, bagaglio da stiva se non incluso, eventuali pulizie o tasse non comprese nel prezzo mostrato.

## Playlist del viaggio

La sezione «Playlist del viaggio» della pagina mostra il player di Spotify (quando la playlist esiste) e sotto la scaletta, divisa per tragitto in macchina. La scaletta sta in `src/playlist.js` (un blocco per tragitto, brani come `[artista, titolo, genere]`); l'ID della playlist Spotify sta in `src/spotify.json`. La build mette entrambi in `/<slug>/viaggio.json`, che la pagina legge: senza ID valido mostra solo la scaletta.

### Creare l'app Spotify (una volta sola)

1. Vai su <https://developer.spotify.com/dashboard>, accedi e scegli **Create app**.
2. Nome e descrizione a piacere; in **Redirect URIs** aggiungi esattamente `http://127.0.0.1:8888/callback`; tra le API spunta **Web API**. Salva.
3. Dalle impostazioni dell'app copia il **Client ID** (il client secret non serve: lo script usa Authorization Code con PKCE).

L'app resta in **Development Mode**: possono usarla solo l'account che l'ha creata e gli utenti aggiunti a mano in *User Management*, **al massimo 5**. Dalle modifiche di Spotify di febbraio 2026 il proprietario dell'app deve avere un abbonamento **Spotify Premium attivo**, altrimenti le chiamate vengono rifiutate. Per creare la playlist sul tuo account basta questo.

### Creare o aggiornare la playlist

```sh
node scripts/spotify.mjs --dry-run                 # scaletta e query, senza rete
SPOTIFY_CLIENT_ID=<client id> node scripts/spotify.mjs [--slug ovest-2027]
```

Lo script apre il browser per il login (se non si apre stampa l'URL), aspetta il ritorno su `127.0.0.1:8888`, cerca ogni brano (prima per titolo e artista esatti, poi con una ricerca libera, tenendo solo risultati dell'artista giusto), crea la playlist **pubblica e non collaborativa** (così il player incorporato funziona per tutti) e aggiunge i brani a blocchi da 100. Usa gli endpoint dopo la migrazione di febbraio 2026: `POST /me/playlists` per creare, `PUT`/`POST /playlists/{id}/items` per i brani, ricerca con `market=IT` (`from_token` ora risponde 403). Se `src/spotify.json` ha già l'ID, sostituisce i brani della stessa playlist invece di crearne un'altra: la fonte di verità è `src/playlist.js`, e i brani aggiunti a mano su Spotify vengono sovrascritti al giro dopo. Alla fine stampa i brani non trovati (da correggere in `src/playlist.js`) e salva l'ID in `src/spotify.json`: committalo e pubblica per vedere il player in pagina. Lo script è solo locale, non gira nel workflow.

Eliminare la playlist dall'app Spotify in realtà smette solo di seguirla: la playlist esiste ancora e lo script continuerebbe ad aggiornarla. Per ripartire da zero con una playlist nuova svuota l'ID in `src/spotify.json` (`"ovest-2027": ""`) e rilancia lo script.

## Capitoli del filmino

Ogni giorno della pagina ha un «Capitolo del filmino» (titolo, cosa racconta, riprese da non perdere) per il video di fine viaggio: è nel campo `film` dei giorni (`DAYS`) dentro lo script di `public/ovest-2027/index.html`, accanto ai consigli su abbigliamento e attrezzatura.
