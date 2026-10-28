// Elenco dei viaggi mostrati in home. Ogni slug corrisponde a una cartella
// servita sotto /viaggi/<slug>/ (in public/ per le pagine HTML statiche).
//
// Campo facoltativo `voli`: se `attivo: true`, scripts/voli.mjs controlla i
// prezzi su Google Flights (SerpApi) e aggiunge le righe a public/<slug>/voli.csv.
// Una ricerca per ogni coppia andata × ritorno, più una per i dettagli del
// ritorno. I viaggi con tutte le date di andata già passate vengono saltati.
// Il budget di ricerche è condiviso tra i viaggi attivi: `npm run voli:dry`.
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
    },
  },
]
