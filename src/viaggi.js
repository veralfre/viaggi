// Elenco dei viaggi mostrati in home. Ogni slug corrisponde a una cartella
// servita sotto /viaggi/<slug>/ (in public/ per le pagine HTML statiche).
//
// Campi facoltativi per lo storico dei prezzi (vedi README):
// - `voli`: con `attivo: true`, scripts/voli.mjs cerca su Google Flights (SerpApi)
//   ogni coppia andata × ritorno, più un ritorno per ogni aeroporto di partenza,
//   e accoda a public/<slug>/voli.csv. `accesso` = costi stimati per arrivare
//   all'aeroporto in auto (andata e ritorno dallo stesso aeroporto). `npm run voli:dry`.
// - `alloggi`: con `attivo: true`, scripts/alloggi.mjs cerca case intere su
//   Airbnb e Booking.com (SerpApi) per ogni tappa e accoda a public/<slug>/alloggi.csv.
//   `npm run alloggi:dry`.
// - `costi`: come dividere il conto (numero di coppie), `noleggio` (diviso tra le
//   coppie), `carburante` (stima, tutta a carico di chi ospita) e voci extra a
//   mano (`importo: null` = da definire, esclusa dai totali). `alternative` = costi
//   (noleggio, carburante.km) degli scenari di `voli.alternative`, per id.
// - `voli.ospiti`: voli di sola andata di chi ospita (uno per tratta, righe tipo=ospiti
//   nel CSV); `voli.alternative`: scenari di confronto (altri aeroporti), ognuno con
//   il suo public/<slug>/voli-<id>.csv. `rientroOspiti` è la vecchia forma (una tratta).
// - `playlistDi`: slug del viaggio di cui si usa la playlist Spotify (src/spotify.json).
// - `nota`: riga facoltativa mostrata nella scheda della home.
// - `valuta`: codice ISO della valuta del viaggio (default 'EUR'): i bot cercano in
//   questa valuta e la pagina mostra gli importi in questa valuta; `accesso`, `costi`
//   e `carburante.prezzoLitro` vanno scritti nella stessa valuta (`euroLitro` è il vecchio
//   nome, ancora accettato). `voli.gl`: mercato di Google Flights (default 'it').
// Date e tappe già passate vengono saltate. I due budget di ricerche (voli e
// alloggi) sono separati e condivisi tra i viaggi attivi. Un viaggio con
// `attivo: false` non entra mai nello schedule, ma `--slug <slug>` lo cerca lo
// stesso, una volta (workflow «Prezzi voli e alloggi», input `slug`).
export const viaggi = [
  {
    slug: 'big-island-2027',
    titolo: 'Dieci giorni sulla Big Island',
    date: '17–28 febbraio 2027',
    luoghi: 'Kona, Hawaiʻi Volcanoes, Mauna Kea, Kohala',
    // Viaggio in dollari: i bot cercano in USD e la pagina mostra in USD.
    valuta: 'USD',
    // Niente ricerca periodica: una sola rilevazione lanciata a mano con --slug (workflow, input slug).
    voli: {
      attivo: false,
      adulti: 2,
      andata: { da: ['DEN'], a: ['KOA'], date: ['2027-02-17'] },
      ritorno: { da: ['KOA'], a: ['DEN'], date: ['2027-02-27'] }, // volo notturno, arrivo domenica 28
      gl: 'us', // Google Flights dal mercato USA: si parte da Denver
      // Auto propria fino a DEN (benzina non stimata) + Pikes Peak lot 10 $/giorno × 11 giorni (tariffa 2025, da riverificare).
      accesso: { DEN: { auto: 0, parcheggio: 110 } },
    },
    alloggi: {
      attivo: false,
      adulti: 2,
      camere: 1,
      bagni: 1,
      // Per due basta un'unità: monolocali (0 camere) e camere d'albergo senza conteggio non si scartano.
      monolocali: true,
      fonti: ['booking'],
      // Booking (codici SerpApi): appartamenti, case vacanza, hotel, B&B, guest house, lodge, inn (a Volcano sono quasi tutti B&B, lodge e inn).
      tipi: ['201', '220', '204', '208', '216', '221', '218'],
      paese: 'us',
      raggioKm: 15,
      tappe: [
        { id: 'kona', nome: 'Kona', q: 'Kailua-Kona, Hawaii, USA', centro: [19.64, -155.9969], dal: '2027-02-17', al: '2027-02-21' },
        {
          id: 'volcano', nome: 'Volcano', q: 'Volcano, Hawaii, USA', centro: [19.4294, -155.2367], dal: '2027-02-21', al: '2027-02-24',
          nota: 'Notti flessibili: se il vulcano si sveglia mentre siamo a Kona si spostano, quindi solo con cancellazione gratuita.',
        },
        {
          // Kamuela è il nome postale di Waimea sulla Big Island (Waimea da solo è anche su Kauaʻi e Oʻahu).
          id: 'kohala', nome: 'Waimea', q: 'Kamuela, Hawaii, USA', centro: [20.0234, -155.6717], raggioKm: 20,
          vicino: 'Waimea', dal: '2027-02-24', al: '2027-02-27',
          nota: 'Base a Waimea, in quota tra le due coste: entro 20 km ci sono anche Waikoloa Village e Kawaihae, più caldi e asciutti.',
        },
      ],
    },
    costi: {
      coppie: 1,
      noleggio: { voce: 'Noleggio auto a Kona (KOA), 17–27 febbraio, ritiro e consegna in aeroporto', importo: null },
      // km da OSRM (somma dei giorni); auto media ~8 l/100 km; AAA Hilo 5,69 $/gal (1/10/2026) ≈ 1,50 $/l.
      carburante: { km: 820, litriPer100: 8, prezzoLitro: 1.5 },
      // Prezzi della ricerca 2026-10-29; tasse stimate con la GET massima 4,712%; mance escluse.
      // Ingressi ai parchi nazionali esclusi: coperti dal pass America the Beautiful.
      extra: [
        { voce: 'Tour in vetta al Mauna Kea, Hawaiʻi Forest & Trail (2 × 315 $ + tasse)', importo: 660 },
        { voce: 'Mante di notte, Sea Paradise (2 × 130 $ + tasse)', importo: 272 },
        { voce: 'Balene, Body Glove Kanoa II (2 × 139,99 $ + tasse)', importo: 293 },
        { voce: 'Parchi statali per non residenti: ʻAkaka Falls e una spiaggia (5 $ a testa + 10 $ l’auto, ciascuno)', importo: 40 },
        { voce: 'Amex Premium Car Rental Protection (per noleggio, al massimo)', importo: 25 },
      ],
    },
  },
  {
    slug: 'ovest-2027-short',
    titolo: 'Dieci giorni nell’Ovest, in sei',
    date: '20–29 luglio 2027',
    luoghi: 'Grand Teton, Yellowstone',
    // Stessa playlist Spotify del viaggio lungo; in pagina la scaletta dei soli tragitti di questa versione.
    playlistDi: 'ovest-2027',
    voli: {
      attivo: true,
      adulti: 4,
      andata: { da: ['BLQ', 'MXP', 'VCE'], a: ['JAC'], date: ['2027-07-19', '2027-07-20'] },
      ritorno: { da: ['BZN'], a: ['BLQ', 'MXP', 'VCE'], date: ['2027-07-29'] },
      // Stime, in euro, per un'auto con i quattro che volano, partendo da Bologna:
      // auto = carburante + pedaggi per una tratta (l'auto intera); parcheggio = tutto il soggiorno.
      accesso: {
        BLQ: { auto: 0, parcheggio: 0 },
        MXP: { auto: 55, parcheggio: 120 },
        VCE: { auto: 33, parcheggio: 100 },
      },
      // Chi ospita vola da Denver a Jackson Hole, ritira il SUV, e alla fine torna da Bozeman (solo andata).
      ospiti: [
        { id: 'arrivo', voce: 'Volo di chi ospita, Denver → Jackson Hole', adulti: 2, da: ['DEN'], a: ['JAC'], date: ['2027-07-20'] },
        { id: 'rientro', voce: 'Volo di chi ospita, Bozeman → Denver', adulti: 2, da: ['BZN'], a: ['DEN'], date: ['2027-07-29'] },
      ],
      // Per confronto: stesso viaggio con andata e ritorno da Salt Lake City (public/<slug>/voli-slc.csv).
      alternative: [
        {
          id: 'slc',
          nome: 'Andata e ritorno da Salt Lake City',
          // ore di auto da OSRM
          descrizione:
            'Si atterra e si riparte da Salt Lake City, con il SUV ritirato e riconsegnato lì: il primo giorno circa 5 ore e mezza di auto fino a Jackson, l’ultimo circa 7 ore e mezza da Bozeman a Salt Lake City.',
          andata: { da: ['BLQ', 'MXP', 'VCE'], a: ['SLC'], date: ['2027-07-20'] },
          ritorno: { da: ['SLC'], a: ['BLQ', 'MXP', 'VCE'], date: ['2027-07-29'] },
          ospiti: [
            { id: 'arrivo', voce: 'Volo di chi ospita, Denver → Salt Lake City', adulti: 2, da: ['DEN'], a: ['SLC'], date: ['2027-07-20'] },
            { id: 'rientro', voce: 'Volo di chi ospita, Salt Lake City → Denver', adulti: 2, da: ['SLC'], a: ['DEN'], date: ['2027-07-29'] },
          ],
        },
      ],
    },
    alloggi: {
      attivo: true,
      adulti: 6,
      camere: 3, // una per coppia
      bagni: 2,
      fonti: ['airbnb', 'booking'],
      paese: 'us', // Booking: scarta risultati in altri paesi (es. Gardiner in Nuova Zelanda)
      // Solo case entro raggioKm dal centro della tappa (si può cambiare per tappa con `raggioKm`).
      raggioKm: 25,
      tappe: [
        { id: 'jackson', nome: 'Jackson', q: 'Jackson, Wyoming, USA', centro: [43.4799, -110.7624], dal: '2027-07-20', al: '2027-07-23' },
        {
          id: 'west-yellowstone',
          nome: 'West Yellowstone',
          q: 'West Yellowstone, Montana, USA',
          centro: [44.6621, -111.1041],
          dal: '2027-07-23',
          al: '2027-07-26',
          nota: 'Dentro il parco non ci sono case vacanza: cerco a West Yellowstone, circa 50 km da Old Faithful.',
        },
        { id: 'gardiner', nome: 'Gardiner', q: 'Gardiner, Montana, USA', centro: [45.0321, -110.7057], dal: '2027-07-26', al: '2027-07-28' },
        { id: 'bozeman', nome: 'Bozeman', q: 'Bozeman, Montana, USA', centro: [45.677, -111.0429], dal: '2027-07-28', al: '2027-07-29' },
      ],
    },
    costi: {
      coppie: 3,
      // Nessun motore SerpApi per il noleggio auto: importo da chiedere (solo andata, Jackson Hole → Bozeman).
      noleggio: { voce: 'Noleggio SUV 7 posti, Jackson Hole → Bozeman (20–29 luglio), solo andata', importo: null },
      // Stima: SUV carico ~19 mpg (12,5 l/100 km), benzina ~3,60 $/gal (0,85 €/l). Paga chi ospita.
      carburante: { km: 1460, litriPer100: 12.5, euroLitro: 0.85 }, // km da OSRM, somma dei giorni
      extra: [],
      // Costi degli scenari di voli.alternative (stessi litri ed euro al litro, km diversi).
      alternative: {
        slc: {
          noleggio: { voce: 'Noleggio SUV 7 posti, Salt Lake City andata e ritorno (20–29 luglio)', importo: null },
          carburante: { km: 2576 }, // km da OSRM: principale + Salt Lake City → Jackson + Bozeman → Salt Lake City
        },
      },
    },
  },
  {
    slug: 'ovest-2027',
    titolo: 'Due settimane nell’Ovest, in sei',
    date: '15–29 luglio 2027',
    luoghi: 'Rocky Mountain, Grand Teton, Yellowstone',
    nota: 'Versione lunga: prezzi non più aggiornati',
    // Voli e alloggi disattivati il 2026-10-29 (si cerca solo la versione breve): la pagina resta pubblicata.
    voli: {
      attivo: false,
      adulti: 4,
      andata: { da: ['BLQ', 'MXP', 'VCE'], a: ['DEN'], date: ['2027-07-14', '2027-07-15', '2027-07-16'] },
      ritorno: { da: ['BZN'], a: ['BLQ', 'MXP', 'VCE'], date: ['2027-07-28', '2027-07-29'] },
      // Stime, in euro, per un'auto con i quattro che volano, partendo da Bologna:
      // auto = carburante + pedaggi per una tratta (l'auto intera); parcheggio = tutto il soggiorno.
      accesso: {
        BLQ: { auto: 0, parcheggio: 0 },
        MXP: { auto: 55, parcheggio: 120 },
        VCE: { auto: 33, parcheggio: 100 },
      },
      // Chi ospita consegna il SUV a Bozeman e torna a Denver in aereo (solo andata).
      rientroOspiti: { attivo: true, adulti: 2, da: ['BZN'], a: ['DEN'], date: ['2027-07-29'] },
    },
    alloggi: {
      attivo: false,
      adulti: 6,
      camere: 3, // una per coppia
      bagni: 2,
      fonti: ['airbnb', 'booking'],
      paese: 'us', // Booking: scarta risultati in altri paesi (es. Gardiner in Nuova Zelanda)
      // Solo case entro raggioKm dal centro della tappa (si può cambiare per tappa con `raggioKm`).
      // Airbnb cerca anche nel riquadro attorno al centro (map_bounds).
      raggioKm: 25,
      tappe: [
        { id: 'denver', nome: 'Denver', q: 'Denver, Colorado, USA', centro: [39.7392, -104.9903], dal: '2027-07-15', al: '2027-07-16' },
        { id: 'estes-park', nome: 'Estes Park', q: 'Estes Park, Colorado, USA', centro: [40.3772, -105.5217], dal: '2027-07-16', al: '2027-07-19' },
        { id: 'jackson', nome: 'Jackson', q: 'Jackson, Wyoming, USA', centro: [43.4799, -110.7624], dal: '2027-07-19', al: '2027-07-22' },
        {
          id: 'west-yellowstone',
          nome: 'Zona Old Faithful',
          q: 'West Yellowstone, Montana, USA',
          centro: [44.6621, -111.1041],
          vicino: 'West Yellowstone',
          dal: '2027-07-22',
          al: '2027-07-25',
          nota: 'Dentro il parco non ci sono case vacanza: cerco a West Yellowstone, circa 50 km da Old Faithful.',
        },
        { id: 'gardiner', nome: 'Gardiner', q: 'Gardiner, Montana, USA', centro: [45.0321, -110.7057], dal: '2027-07-25', al: '2027-07-28' },
        { id: 'bozeman', nome: 'Bozeman', q: 'Bozeman, Montana, USA', centro: [45.677, -111.0429], dal: '2027-07-28', al: '2027-07-29' },
      ],
    },
    costi: {
      coppie: 3,
      // Nessun motore SerpApi per il noleggio auto: importi a mano, presi il 2026-10-29.
      noleggio: {
        voce: 'Noleggio SUV 7 posti, Denver → Bozeman (16–29 luglio)',
        // Jeep Grand Cherokee L o simile, km illimitati, cancellazione gratuita.
        // Preventivo per 16–30 luglio, prima di anticipare il rientro al 29: da rifare.
        importo: 1816,
      },
      // Stima: SUV carico ~19 mpg (12,5 l/100 km), benzina ~3,60 $/gal (0,85 €/l). Paga chi ospita.
      carburante: { km: 2300, litriPer100: 12.5, euroLitro: 0.85 },
      extra: [],
    },
  },
]
