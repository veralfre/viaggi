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
// - `costi`: come dividere il conto (numero di coppie) e voci extra a mano
//   (`importo: null` = da definire, esclusa dai totali).
// Date e tappe già passate vengono saltate. I due budget di ricerche (voli e
// alloggi) sono separati e condivisi tra i viaggi attivi.
export const viaggi = [
  {
    slug: 'ovest-2027',
    titolo: 'Due settimane nell’Ovest, in sei',
    date: '17–31 luglio 2027',
    luoghi: 'Rocky Mountain, Grand Teton, Yellowstone',
    voli: {
      attivo: true,
      adulti: 4,
      andata: { da: ['BLQ', 'MXP', 'VCE'], a: ['DEN'], date: ['2027-07-16', '2027-07-17', '2027-07-18'] },
      ritorno: { da: ['BZN'], a: ['BLQ', 'MXP', 'VCE'], date: ['2027-07-30', '2027-07-31', '2027-08-01'] },
      // Stime, in euro, per un'auto con i quattro che volano, partendo da Bologna:
      // auto = carburante + pedaggi per una tratta (l'auto intera); parcheggio = tutto il soggiorno.
      accesso: {
        BLQ: { auto: 0, parcheggio: 0 },
        MXP: { auto: 55, parcheggio: 120 },
        VCE: { auto: 33, parcheggio: 100 },
      },
    },
    alloggi: {
      attivo: true,
      adulti: 6,
      camere: 3, // una per coppia
      bagni: 2,
      fonti: ['airbnb', 'booking'],
      tappe: [
        { id: 'denver', nome: 'Denver', q: 'Denver, CO', dal: '2027-07-17', al: '2027-07-18' },
        { id: 'estes-park', nome: 'Estes Park', q: 'Estes Park, CO', dal: '2027-07-18', al: '2027-07-21' },
        { id: 'jackson', nome: 'Jackson', q: 'Jackson, WY', dal: '2027-07-21', al: '2027-07-24' },
        {
          id: 'west-yellowstone',
          nome: 'Zona Old Faithful',
          q: 'West Yellowstone, MT',
          dal: '2027-07-24',
          al: '2027-07-27',
          nota: 'Dentro il parco non ci sono case vacanza: cerco a West Yellowstone, circa 50 km da Old Faithful.',
        },
        { id: 'gardiner', nome: 'Gardiner', q: 'Gardiner, MT', dal: '2027-07-27', al: '2027-07-30' },
        { id: 'bozeman', nome: 'Bozeman', q: 'Bozeman, MT', dal: '2027-07-30', al: '2027-07-31' },
      ],
    },
    costi: {
      coppie: 3,
      // Nessun motore SerpApi per il noleggio auto: importi a mano, null = da definire.
      extra: [
        { voce: 'Noleggio SUV', importo: null },
        { voce: 'Carburante (circa 2.300 km)', importo: null },
      ],
    },
  },
]
