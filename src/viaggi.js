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
// - Stime a mano (facoltative, nella valuta del viaggio) per quando i bot non trovano ancora prezzi
//   (voli oltre la finestra di ~330 giorni di Google Flights, Booking per date lontane): `voli.stima` =
//   andata e ritorno, totale per gli `adulti`; `stima` su ogni tratta di `voli.ospiti` = totale per i suoi
//   `adulti`; `stimaNotte` su ogni tappa di `alloggi` = prezzo a notte della sistemazione. La build le mette
//   in viaggio.json (`stimaVoli`, `ospiti[].stima`, `alloggi.tappe[].stimaNotte` e `.stima` = × notti) e la
//   pagina le usa, segnate come stime, finché non c'è il prezzo rilevato.
// - Scenario con meno persone: `voli.alternative[].adulti` = adulti in volo dall'Italia nello scenario
//   (default `voli.adulti`; vale anche per l'accesso all'aeroporto); `costi.alternative[id].coppie` = coppie
//   tra cui si divide il conto dello scenario; `costi.alternative[id].fattoreCase` = stima delle case dello
//   scenario come frazione del totale case rilevato (es. 0.75 = case per 4 a tre quarti di quelle per 6).
// - `zona` (facoltativa): paese della voce per il conto diviso per paese, su tappe di `alloggi`, tratte di
//   `voli.ospiti` (il paese in cui si atterra) e righe di `costi.extra` (dove si fa l'attività). Non è `paese`,
//   che per gli alloggi è il filtro del paese di Booking. Andata e ritorno e accesso restano senza zona.
// Date e tappe già passate vengono saltate. I due budget di ricerche (voli e
// alloggi) sono separati e condivisi tra i viaggi attivi. Un viaggio con
// `attivo: false` non entra mai nello schedule, ma `--slug <slug>` lo cerca lo
// stesso, una volta (workflow «Prezzi voli e alloggi», input `slug`).
export const viaggi = [
  {
    slug: 'costa-ovest-2027',
    titolo: 'Da Seattle a Los Angeles, lungo il mare',
    date: '7–22 agosto 2027',
    luoghi: 'Olympic, costa dell’Oregon, Redwoods, San Francisco, Yosemite, Big Sur',
    // Niente playlist (nessun playlistDi, nessun blocco in src/playlist.js).
    // Niente ricerca periodica: una sola rilevazione lanciata a mano con --slug (workflow, input slug).
    voli: {
      attivo: false,
      adulti: 4,
      andata: { da: ['MXP', 'VCE'], a: ['SEA'], date: ['2027-08-07'] },
      ritorno: { da: ['LAX'], a: ['MXP', 'VCE'], date: ['2027-08-21'] }, // volo serale, arrivo domenica 22
      // Stime, in euro, per un'auto con chi vola: auto = carburante + pedaggi per una tratta; parcheggio = 16 giorni
      // (7–22 agosto). Tratte come ovest-2027-short; parcheggi scalati da 11 a 16 giorni, da verificare.
      accesso: {
        MXP: { auto: 55, parcheggio: 160 },
        VCE: { auto: 33, parcheggio: 135 },
      },
      // Chi ospita vola da Denver a Seattle, ritira l'auto, e alla fine torna da Los Angeles (solo andata).
      ospiti: [
        { id: 'arrivo', voce: 'Volo di chi ospita, Denver → Seattle', adulti: 2, da: ['DEN'], a: ['SEA'], date: ['2027-08-07'] },
        { id: 'rientro', voce: 'Volo di chi ospita, Los Angeles → Denver', adulti: 2, da: ['LAX'], a: ['DEN'], date: ['2027-08-21'] },
      ],
      // «Se siamo in quattro»: stesso viaggio, dall'Italia volano solo in due (public/<slug>/voli-in4.csv).
      alternative: [
        {
          id: 'in4',
          nome: 'Se siamo in quattro',
          descrizione:
            'Stesso giro con due coppie: dall’Italia volano in due, l’auto è più piccola e le case hanno due camere invece di tre (stima: tre quarti del prezzo della casa per sei).',
          adulti: 2,
          andata: { da: ['MXP', 'VCE'], a: ['SEA'], date: ['2027-08-07'] },
          ritorno: { da: ['LAX'], a: ['MXP', 'VCE'], date: ['2027-08-21'] },
          ospiti: [
            { id: 'arrivo', voce: 'Volo di chi ospita, Denver → Seattle', adulti: 2, da: ['DEN'], a: ['SEA'], date: ['2027-08-07'] },
            { id: 'rientro', voce: 'Volo di chi ospita, Los Angeles → Denver', adulti: 2, da: ['LAX'], a: ['DEN'], date: ['2027-08-21'] },
          ],
        },
      ],
    },
    alloggi: {
      attivo: false,
      adulti: 6,
      camere: 3, // una per coppia
      bagni: 2,
      fonti: ['airbnb', 'booking'],
      paese: 'us',
      raggioKm: 25,
      tappe: [
        { id: 'seattle', nome: 'Seattle', q: 'Seattle, Washington, USA', centro: [47.6062, -122.3321], raggioKm: 15, dal: '2027-08-07', al: '2027-08-09' },
        {
          id: 'forks', nome: 'Forks', q: 'Forks, Washington, USA', centro: [47.9504, -124.3855], raggioKm: 30, dal: '2027-08-09', al: '2027-08-10',
          nota: 'Per Rialto Beach la sera e la Hoh Rain Forest la mattina presto. Entro 30 km anche La Push.',
        },
        { id: 'cannon-beach', nome: 'Cannon Beach', q: 'Cannon Beach, Oregon, USA', centro: [45.8918, -123.9615], raggioKm: 20, dal: '2027-08-10', al: '2027-08-11' },
        {
          id: 'yachats', nome: 'Yachats', q: 'Yachats, Oregon, USA', centro: [44.3112, -124.1043], raggioKm: 30, dal: '2027-08-11', al: '2027-08-12',
          nota: 'A metà della costa dell’Oregon: entro 30 km anche Waldport e Cape Perpetua.',
        },
        { id: 'gold-beach', nome: 'Gold Beach', q: 'Gold Beach, Oregon, USA', centro: [42.4073, -124.4218], raggioKm: 30, dal: '2027-08-12', al: '2027-08-13' },
        {
          id: 'trinidad', nome: 'Trinidad', q: 'Trinidad, California, USA', centro: [41.0593, -124.1431], raggioKm: 35, dal: '2027-08-13', al: '2027-08-14',
          nota: 'Tra le sequoie di Prairie Creek e Eureka: entro 35 km anche Orick, McKinleyville e Arcata.',
        },
        { id: 'mendocino', nome: 'Mendocino', q: 'Mendocino, California, USA', centro: [39.3077, -123.7995], raggioKm: 20, dal: '2027-08-14', al: '2027-08-15' },
        { id: 'san-francisco', nome: 'San Francisco', q: 'San Francisco, California, USA', centro: [37.7749, -122.4194], raggioKm: 10, dal: '2027-08-15', al: '2027-08-17' },
        {
          id: 'yosemite', nome: 'Yosemite', q: 'Yosemite West, California, USA', centro: [37.651, -119.7], raggioKm: 30, vicino: 'Yosemite West',
          dal: '2027-08-17', al: '2027-08-19',
          nota: 'Prima scelta: dormire dentro il parco (Yosemite Valley Lodge, Curry Village, Wawona), solo su travelyosemite.com, con molti mesi di anticipo. Qui cerco case entro 30 km: Yosemite West (dentro il parco, a 30 minuti dalla valle), Wawona, El Portal, Foresta.',
        },
        { id: 'monterey', nome: 'Monterey', q: 'Monterey, California, USA', centro: [36.6002, -121.8947], raggioKm: 15, dal: '2027-08-19', al: '2027-08-20' },
        { id: 'santa-barbara', nome: 'Santa Barbara', q: 'Santa Barbara, California, USA', centro: [34.4208, -119.6982], raggioKm: 20, dal: '2027-08-20', al: '2027-08-21' },
      ],
    },
    costi: {
      coppie: 3,
      // Nessun motore SerpApi per il noleggio: importo da chiedere. Solo andata tra due stati: c'è il supplemento di riconsegna.
      noleggio: { voce: 'Noleggio SUV grande o minivan 7-8 posti, Seattle (SEA) → Los Angeles (LAX), 7–21 agosto, solo andata', importo: null },
      // km da OSRM, somma dei 15 giorni (compresa la gita facoltativa al Rainier, 334 km); SUV o minivan carico ~12 l/100 km;
      // benzina media WA/OR/CA ~4,50 $/gal ≈ 1,05 €/l (stima). Paga chi ospita.
      carburante: { km: 3730, litriPer100: 12, euroLitro: 1.05 },
      extra: [],
      alternative: {
        in4: {
          coppie: 2,
          noleggio: { voce: 'Noleggio SUV 5 posti, Seattle (SEA) → Los Angeles (LAX), 7–21 agosto, solo andata', importo: null },
          carburante: { litriPer100: 10 },
          // Case per 4 con 2 camere: stimate a tre quarti del prezzo rilevato per 6 con 3 camere (nessuna ricerca in più).
          fattoreCase: 0.75,
        },
      },
    },
  },
  {
    slug: 'sudamerica-2028',
    titolo: 'Il grand tour del Sud America',
    date: '2 febbraio – 16 marzo 2028',
    luoghi: 'Patagonia, Atacama, Uyuni, Titicaca, Machu Picchu, Antigua, Galápagos',
    // Viaggio in dollari: i bot cercano in USD e la pagina mostra in USD.
    valuta: 'USD',
    // Niente ricerca periodica: una sola rilevazione lanciata a mano con --slug (workflow, input slug).
    // Google Flights mostra i voli solo ~330 giorni avanti: l'andata del 2/2/2028 si vede da ~9/3/2027, il ritorno
    // del 16/3/2028 da ~21/4/2027, quindi la rilevazione va fatta tra marzo e fine aprile 2027. Fino ad allora la
    // pagina usa le stime; gli alloggi si possono già cercare.
    voli: {
      attivo: false,
      adulti: 2,
      // Open-jaw: si entra da Buenos Aires (solo scalo) e si torna dalle Galápagos via Guayaquil.
      andata: { da: ['DEN'], a: ['EZE'], date: ['2028-02-02'] }, // volo notturno, arrivo giovedì 3
      ritorno: { da: ['GYE'], a: ['DEN'], date: ['2028-03-16'] },
      gl: 'us', // Google Flights dal mercato USA: si parte da Denver
      // Stime (totale per due, USD) finché Google Flights non mostra le date: la pagina le usa al posto del prezzo
      // rilevato e le segna come stime. Criterio: tariffe viste su Kayak/Orbitz/Travelocity/FareCompare il 2026-11-15
      // per la stessa tratta di sola andata, arrotondate in su per orari comodi, l'estate australe e il 2028.
      // Andata: Kayak DEN → EZE 394 $, Orbitz 486 $, Travelocity 584 $, FareCompare media 512 $ → ~650 $ a testa;
      // ritorno: Kayak GYE → DEN ~290 $ (Orbitz da 220 $) → ~350 $. ≈ 2 × (650 + 350).
      stima: 2000,
      // Uber per DEN andata e ritorno (~60 $ a tratta, stima): 43 giorni di parcheggio costerebbero ~430 $.
      accesso: { DEN: { auto: 60, parcheggio: 0 } },
      // I voli interni sono biglietti di sola andata separati: una ricerca per tratta (righe tipo=ospiti nel CSV).
      ospiti: [
        // `stima` = totale per due (USD), stesso criterio di voli.stima (ricerca del 2026-11-15).
        // `zona` = il paese in cui si atterra.
        // eDreams, Aerolíneas Buenos Aires → El Calafate 107–225 $; da Ezeiza o da Aeroparque (stessa ricerca)
        { id: 'eze-fte', voce: 'Volo interno, Buenos Aires → El Calafate', adulti: 2, da: ['EZE', 'AEP'], a: ['FTE'], date: ['2028-02-03'], stima: 400, zona: 'Argentina' },
        // LATAM SCL–PNT da ~70 $, ~3 voli a settimana in estate; si parte da Natales, a 7 km.
        // Se PNT non ha voli, bus Natales → Punta Arenas e volo da lì.
        { id: 'pnt-scl', voce: 'Volo interno, Puerto Natales → Santiago (o da Punta Arenas)', adulti: 2, da: ['PNT', 'PUQ'], a: ['SCL'], date: ['2028-02-12'], stima: 300, zona: 'Cile' },
        // Kayak 33–71 $, Momondo 60 $ (Sky, JetSMART, LATAM), bagaglio a parte sulle low cost
        { id: 'scl-cjc', voce: 'Volo interno, Santiago → Calama (per San Pedro de Atacama)', adulti: 2, da: ['SCL'], a: ['CJC'], date: ['2028-02-13'], stima: 160, zona: 'Cile' },
        // BoA diretto ~84 $ (flightconnections.com)
        { id: 'uyu-lpb', voce: 'Volo interno, Uyuni → La Paz', adulti: 2, da: ['UYU'], a: ['LPB'], date: ['2028-02-21'], stima: 200, zona: 'Bolivia' },
        // Trip.com da 239 $, Expedia da 250 $, Kiwi 216–277 $
        { id: 'cuz-gua', voce: 'Volo, Cusco → Città del Guatemala (via Lima)', adulti: 2, da: ['CUZ'], a: ['GUA'], date: ['2028-03-03'], stima: 600, zona: 'Guatemala' },
        // Travelocity Copa 275–291 $, copaair.com da 368 $
        { id: 'gua-gye', voce: 'Volo, Città del Guatemala → Guayaquil (via Panamá)', adulti: 2, da: ['GUA'], a: ['GYE'], date: ['2028-03-07'], stima: 700, zona: 'Ecuador e Galápagos' },
        // LATAM da 116 $ (maggio 2026), Trip.com 121 $, Momondo 180 $
        { id: 'gye-gps', voce: 'Volo interno, Guayaquil → Galápagos (Baltra)', adulti: 2, da: ['GYE'], a: ['GPS'], date: ['2028-03-08'], stima: 360, zona: 'Ecuador e Galápagos' },
        // Travelocity GYE → SCY 159 $, FareCompare media 146 $; stessi prezzi nelle due direzioni (voyagers.travel)
        { id: 'scy-gye', voce: 'Volo interno, San Cristóbal (Galápagos) → Guayaquil', adulti: 2, da: ['SCY'], a: ['GYE'], date: ['2028-03-15'], stima: 360, zona: 'Ecuador e Galápagos' },
      ],
    },
    alloggi: {
      attivo: false,
      adulti: 2,
      camere: 1,
      bagni: 1,
      // Per due basta un'unità: monolocali (0 camere) e camere d'albergo senza conteggio non si scartano.
      monolocali: true,
      fonti: ['booking'],
      // Booking (codici SerpApi): appartamenti, case vacanza, hotel, B&B, guest house, lodge, inn (come Big Island).
      tipi: ['201', '220', '204', '208', '216', '221', '218'],
      // Niente `paese`: sei paesi diversi; i risultati del paese sbagliato li scarta già il raggio dal centro.
      raggioKm: 10,
      // `stimaNotte` = USD a notte per la camera doppia, livello comfort da luna di miele (hotel con voto 8+ in centro,
      // non lusso e non il più economico), finché Booking non risponde per date così lontane. Criterio: prezzi visti
      // su Booking/Kayak/Momondo/Expedia nella ricerca del 2026-11-15, arrotondati in su per il 2028; febbraio è alta
      // stagione in Patagonia (+20–30%), febbraio–marzo bassa in Perù (−10–15%).
      tappe: [
        // voto 8,9–9,5: Destino Calafate da 116 $, Calafate Parque 140 $, El Quijote 153 $, + alta stagione
        { id: 'calafate', nome: 'El Calafate', q: 'El Calafate, Argentina', centro: [-50.3379, -72.2648], dal: '2028-02-03', al: '2028-02-05', stimaNotte: 210, zona: 'Argentina' },
        // Booking: 3 stelle ~135 $, 4 stelle ~249 $, + alta stagione
        { id: 'chalten', nome: 'El Chaltén', q: 'El Chaltén, Argentina', centro: [-49.3315, -72.8863], raggioKm: 8, dal: '2028-02-05', al: '2028-02-08', stimaNotte: 230, zona: 'Argentina' },
        { id: 'calafate-2', nome: 'El Calafate', q: 'El Calafate, Argentina', centro: [-50.3379, -72.2648], dal: '2028-02-08', al: '2028-02-09', stimaNotte: 210, zona: 'Argentina' },
        {
          // Hotel Lago Grey ~450–500 $ in alta stagione (Trip.com da 504 $, Orbitz 333 $ a maggio 2026); solo camera.
          // Meglio nel settore Pehoé/Grey/Río Serrano, vicino al molo della barca dei fiordi (Villa Serrano).
          id: 'paine', nome: 'Torres del Paine', q: 'Torres del Paine, Chile', centro: [-51.0, -72.9], raggioKm: 40, dal: '2028-02-09', al: '2028-02-11',
          stimaNotte: 520, zona: 'Cile',
          nota: 'Hotel dentro il parco: cerco entro 40 km dal centro, così entrano sia la zona di Las Torres sia quella del Pehoé, del Grey e del Río Serrano.',
        },
        {
          // Travelocity: Weskar ~272 $ il 20–21/2, Big Sur ~135 $, Best Western 176 $ a marzo
          id: 'puerto-natales', nome: 'Puerto Natales', q: 'Puerto Natales, Chile', centro: [-51.7236, -72.4875], raggioKm: 5, dal: '2028-02-11', al: '2028-02-12',
          stimaNotte: 230, zona: 'Cile',
          nota: 'Si arriva in barca dai fiordi; l’aeroporto è a 7 km.',
        },
        {
          // stima: hotel di catena davanti al terminal
          id: 'santiago', nome: 'Santiago, aeroporto', q: 'Santiago airport, Chile', centro: [-33.393, -70.786], raggioKm: 8, vicino: 'aeroporto di Santiago',
          dal: '2028-02-12', al: '2028-02-13', stimaNotte: 180, zona: 'Cile',
        },
        // Hotel Desertica, Quechua 160–277 $, Cumbres ~248 $
        { id: 'san-pedro', nome: 'San Pedro de Atacama', q: 'San Pedro de Atacama, Chile', centro: [-22.9087, -68.1997], raggioKm: 8, dal: '2028-02-13', al: '2028-02-16', stimaNotte: 230, zona: 'Cile' },
        {
          // hotel di sale al bordo del salar: Luna Salada 301 $ per una notte di febbraio (Hotels.com), Palacio de Sal da ~239 $ (Momondo).
          // Il raggio di 30 km comprende Colchani e gli hotel di sale.
          id: 'uyuni', nome: 'Uyuni', q: 'Uyuni, Bolivia', centro: [-20.4597, -66.8261], raggioKm: 30, dal: '2028-02-18', al: '2028-02-21', stimaNotte: 260, zona: 'Bolivia',
          nota: 'Le due notti prima (16 e 17 febbraio) sono comprese nel tour di gruppo da San Pedro. Tre notti qui per lo specchio: l’alba, e il tramonto con le stelle il 20, il compleanno. Meglio un hotel di sale al bordo del salar.',
        },
        // stima: hotel 8+ a Sopocachi o San Jorge
        { id: 'la-paz', nome: 'La Paz', q: 'La Paz, Bolivia', centro: [-16.5, -68.1193], dal: '2028-02-21', al: '2028-02-22', stimaNotte: 130, zona: 'Bolivia' },
        {
          // stima: ecolodge di Yumani con vista sul lago
          id: 'isla-del-sol', nome: 'Isla del Sol', q: 'Copacabana, Bolivia', centro: [-16.1661, -69.0861], raggioKm: 20, vicino: 'Copacabana',
          dal: '2028-02-22', al: '2028-02-23', stimaNotte: 110, zona: 'Bolivia',
          nota: 'Si dorme a Yumani, sull’isola: cerco entro 20 km da Copacabana, che comprende l’isola.',
        },
        // Il treno PeruRail Titicaca parte da Puno lunedì, giovedì e sabato (orario 2025): giovedì 24 febbraio.
        // Dall'8/8/2026 servizio misto bus + treno per una frana al km 284–285 (perurail.com): da riverificare.
        // stima: hotel 8+ sul lago o in centro
        { id: 'puno', nome: 'Puno', q: 'Puno, Peru', centro: [-15.8402, -70.0219], dal: '2028-02-23', al: '2028-02-24', stimaNotte: 130, zona: 'Perù' },
        // boutique in centro: da ~66 $ a 255–317 $ per i 4,5 stelle; comfort ~170 $, −10–15% in stagione delle piogge
        { id: 'cusco', nome: 'Cusco', q: 'Cusco, Peru', centro: [-13.517, -71.9785], raggioKm: 5, dal: '2028-02-24', al: '2028-02-28', stimaNotte: 150, zona: 'Perù' },
        // stima: hotel con giardino in valle (i resort di lusso costano il doppio); due notti per la Valle Sacra in due giorni
        { id: 'urubamba', nome: 'Urubamba', q: 'Urubamba, Peru', centro: [-13.3047, -72.116], raggioKm: 20, dal: '2028-02-28', al: '2028-03-01', stimaNotte: 140, zona: 'Perù' },
        {
          // guida aprile 2026 (Yapa Explorers): fascia media 50–150 $, premium 150–350 $
          id: 'aguas-calientes', nome: 'Aguas Calientes', q: 'Machu Picchu Pueblo, Peru', centro: [-13.1547, -72.5254], raggioKm: 3,
          dal: '2028-03-01', al: '2028-03-02', stimaNotte: 180, zona: 'Perù',
        },
        { id: 'cusco-2', nome: 'Cusco', q: 'Cusco, Peru', centro: [-13.517, -71.9785], raggioKm: 5, dal: '2028-03-02', al: '2028-03-03', stimaNotte: 150, zona: 'Perù' },
        {
          // stima: hotel boutique 8+ in centro, stagione secca (nessun listino trovato: da verificare)
          id: 'antigua', nome: 'Antigua', q: 'Antigua Guatemala', centro: [14.5586, -90.7295], raggioKm: 6, dal: '2028-03-03', al: '2028-03-07', stimaNotte: 170, zona: 'Guatemala',
          // La notte del 5 marzo all'Earth Lodge (El Hato, ~5 km di strada, dentro il raggio): Panoramic Room per due
          // ~125 $, ~153 $ con le tasse (Hotels.com, Las Cúpulas at Earth Lodge), simile alla stima della tappa.
          nota: 'La notte del 5 marzo in un lodge con vista sul Fuego, sulle colline a ~5 km.',
        },
        {
          // stima: hotel di catena vicino al terminal
          id: 'guayaquil', nome: 'Guayaquil, aeroporto', q: 'Guayaquil airport, Ecuador', centro: [-2.1574, -79.8837], raggioKm: 6, vicino: 'aeroporto di Guayaquil',
          dal: '2028-03-07', al: '2028-03-08', stimaNotte: 150, zona: 'Ecuador e Galápagos',
        },
        // Puerto Ayora 80–280 $ (Solymar sul Malecón 110–170 $); comfort ~220 $
        { id: 'santa-cruz', nome: 'Santa Cruz', q: 'Puerto Ayora, Galápagos', centro: [-0.7432, -90.3134], vicino: 'Puerto Ayora', dal: '2028-03-08', al: '2028-03-10', stimaNotte: 220, zona: 'Ecuador e Galápagos' },
        // Puerto Villamil 50–180 $, Isabela Island Hotel sulla spiaggia 125–185 $
        { id: 'isabela', nome: 'Isabela', q: 'Puerto Villamil, Galápagos', centro: [-0.9564, -90.9667], raggioKm: 8, vicino: 'Puerto Villamil', dal: '2028-03-10', al: '2028-03-12', stimaNotte: 180, zona: 'Ecuador e Galápagos' },
        // Puerto Baquerizo Moreno 60–240 $, ~20–30% meno di Santa Cruz
        {
          id: 'san-cristobal', nome: 'San Cristóbal', q: 'Puerto Baquerizo Moreno, Galápagos', centro: [-0.9017, -89.6103], raggioKm: 6, vicino: 'Puerto Baquerizo Moreno',
          dal: '2028-03-12', al: '2028-03-15', stimaNotte: 170, zona: 'Ecuador e Galápagos',
        },
        {
          id: 'guayaquil-2', nome: 'Guayaquil, aeroporto', q: 'Guayaquil airport, Ecuador', centro: [-2.1574, -79.8837], raggioKm: 6, vicino: 'aeroporto di Guayaquil',
          dal: '2028-03-15', al: '2028-03-16', stimaNotte: 150, zona: 'Ecuador e Galápagos',
          nota: 'Notte di riserva: se il volo dalle Galápagos ritarda, il volo per Denver è comunque il mattino dopo.',
        },
      ],
    },
    costi: {
      coppie: 1,
      // Niente auto a noleggio né benzina: transfer, bus, treni e barche stanno tra gli extra.
      // Stime per due in USD da prezzi 2026 (ricerca 2026-11-15; cambi ~1.450 ARS, ~950 CLP, ~3,7 PEN per dollaro),
      // da ricontrollare prima di prenotare. Mance escluse.
      extra: [
        // galapagosisland.net (requisiti di ingresso 2026)
        { voce: 'Galápagos: parco nazionale (2 × 200 $, contanti) e carta di transito TCT (2 × 20 $)', importo: 440, zona: 'Ecuador e Galápagos' },
        // galapagos ferry: 35–45 $ a testa a tratta (wetravel.com, happygringo.com); tassa d'ingresso a Isabela 10 $ a testa, taxi d'acqua
        { voce: 'Traghetti Santa Cruz → Isabela → Santa Cruz → San Cristóbal (3 tratte × 2 × ~40 $), tassa di Isabela e taxi d’acqua', importo: 270, zona: 'Ecuador e Galápagos' },
        { voce: 'Gita in barca a North Seymour o Bartolomé (2 × ~280 $)', importo: 560, zona: 'Ecuador e Galápagos' },
        { voce: 'Los Túneles in barca, Isabela (2 × ~150 $)', importo: 300, zona: 'Ecuador e Galápagos' },
        // listino 2025 di un operatore di San Cristóbal (usfq.edu.ec): 170 $ + IVA 15% a testa, max 12; Expedia fino a 257 $
        { voce: 'Kicker Rock (León Dormido) in barca con snorkeling, San Cristóbal (2 × ~200 $)', importo: 400, zona: 'Ecuador e Galápagos' },
        // biglietto S/ 152 + S/ 11 (andina.pe, machupicchu.org, 2026), circuito 2A senza Huayna Picchu
        { voce: 'Machu Picchu, circuito 2A (classico), guida obbligatoria e bus Consettur', importo: 200, zona: 'Perù' },
        { voce: 'Treno Ollantaytambo ↔ Aguas Calientes, Vistadome andata e ritorno', importo: 360, zona: 'Perù' },
        { voce: 'Valle Sacra con autista in due giorni e boleto turístico', importo: 290, zona: 'Perù' },
        // Guida di terzi (maggio 2026): da ~270 $ a testa in economy, +25% in alta stagione; Magpie da 205 $.
        // perurail.com non pubblica le tariffe fuori dal motore di prenotazione: verificare lì.
        { voce: 'Treno PeruRail Titicaca, Puno → Cusco (2 × ~270 $, pasti compresi)', importo: 540, zona: 'Perù' },
        // TourRadar: gruppo piccolo ~98 $ a testa (2026); cavallo in salita S/ 80–90, ~80% del sentiero (samtravelperu, trexperienceperu).
        { voce: 'Laguna Humantay, gita in giornata da Cusco in gruppo piccolo (2 × ~100 $) e cavallo in salita (2 × ~25 $)', importo: 250, zona: 'Perù' },
        // nomades.com: Nomades CLP 219.000 a testa; parchi boliviani Avaroa 150 Bs e Incahuasi 30 Bs.
        // Con le piogge Incahuasi spesso si salta e la seconda notte può essere a Uyuni o al bordo del salar.
        { voce: 'Uyuni, tour di gruppo di 3 giorni da San Pedro e ingressi ai parchi boliviani', importo: 525, zona: 'Bolivia' },
        // gite dello specchio da Uyuni, ~75–130 $ a testa (Expedia «sunset and stargazing», Lokalee)
        { voce: 'Uyuni: tramonto e stelle sul salar a specchio, gruppo piccolo, 4–5 ore, stivali compresi (2 × ~90 $)', importo: 180, zona: 'Bolivia' },
        { voce: 'Uyuni: alba sul salar a specchio, gruppo piccolo (2 × ~75 $)', importo: 150, zona: 'Bolivia' },
        { voce: 'San Pedro de Atacama: due gite (Valle de la Luna, lagune altiplaniche) e transfer da Calama', importo: 250, zona: 'Cile' },
        { voce: 'San Pedro, tour astronomico (facoltativo, 2 × ~45 $)', importo: 90, zona: 'Cile' },
        { voce: 'Titicaca: bus La Paz → Copacabana, barca e tasse dell’Isla del Sol, bus per Puno', importo: 110, zona: 'Bolivia' },
        // stima: l'ultimo tratto per El Hato è sterrato; pickup o tuk-tuk dal centro. Il volo in elicottero sul Fuego
        // (facoltativo, ~4.000 $ a volo privato) sta solo in pagina, non nel conto.
        { voce: 'Transfer Antigua ↔ Earth Lodge in 4x4, andata e ritorno', importo: 40, zona: 'Guatemala' },
        // argentina.gob.ar/parquesnacionales/tarifas
        { voce: 'Perito Moreno: ingresso (2 × ARS 50.000), barca e transfer', importo: 230, zona: 'Argentina' },
        // nuove tariffe CONAF dal 1/5/2026, pasesparques.cl
        { voce: 'Torres del Paine, ingresso al parco', importo: 100, zona: 'Cile' },
        { voce: 'Transfer privato El Calafate → Cerro Castillo → Torres del Paine', importo: 450, zona: 'Argentina' },
        { voce: 'Bus El Calafate ↔ El Chaltén andata e ritorno e transfer aeroporto FTE → El Calafate', importo: 170, zona: 'Argentina' },
        { voce: 'Taxi Ezeiza → Aeroparque, se il volo per El Calafate parte da lì', importo: 50, zona: 'Argentina' },
        // civitatis: molo a 37 km da El Chaltén, barca 45 min, ARS 45.000 in contanti, da giovedì a martedì alle 12:00
        { voce: 'Lago del Desierto: navetta da El Chaltén, barca e riserva del Glaciar Huemul (2 × ~75 $)', importo: 150, zona: 'Argentina' },
        { voce: 'Navetta aeroporto di Città del Guatemala ↔ Antigua', importo: 60, zona: 'Guatemala' },
        // transfer privato nel parco CLP 80.000–150.000 a veicolo (dicaschile.com.br); taxi Natales → PNT, 7 km.
        { voce: 'Autista nel parco (Laguna Azul e Lago Grey), transfer dall’hotel al molo del Río Serrano e taxi per l’aeroporto di Puerto Natales', importo: 280, zona: 'Cile' },
        // Turismo 21 de Mayo (tutti i giorni set–apr), Nomades CLP 112.000–132.000 a testa (la pagina Nomades oggi dice «non più
        // operativa»: verificare). Il vento può annullarla (rimborso). Piano B: Solo Expediciones dall'Hotel del Paine (~307–364 $ a testa).
        { voce: 'Fiordo Última Esperanza: zodiac sul Río Serrano, ghiacciai Serrano e Balmaceda, pranzo in estancia, arrivo in barca a Puerto Natales (2 × ~150 $)', importo: 300, zona: 'Cile' },
      ],
    },
  },
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
    // Seguito del viaggio breve per la sola coppia che ospita: gli altri tornano a casa da Bozeman il 29.
    slug: 'ovest-2027-glacier',
    titolo: 'Glacier, il prolungamento in due',
    date: '29 luglio – 2 agosto 2027',
    luoghi: 'Flathead Lake, Glacier',
    nota: 'Saltato: niente prolungamento, si torna a Denver con gli altri',
    // Stessa playlist Spotify dell'Ovest; in pagina la scaletta dei tragitti di questi giorni.
    playlistDi: 'ovest-2027',
    // Viaggio in dollari: i bot cercano in USD e la pagina mostra in USD.
    valuta: 'USD',
    // Niente ricerca periodica: con lo schedule i voli salirebbero a 19 ricerche per esecuzione
    // (304 al mese). Una sola rilevazione lanciata a mano con --slug (workflow, input slug).
    voli: {
      attivo: false,
      adulti: 2,
      // Il biglietto vero di chi ospita: Denver → Jackson Hole il 20 (inizio del viaggio in sei)
      // e Kalispell → Denver il 2 agosto, al posto del Bozeman → Denver del 29.
      andata: { da: ['DEN'], a: ['JAC'], date: ['2027-07-20'] },
      ritorno: { da: ['FCA'], a: ['DEN'], date: ['2027-08-02'] },
      gl: 'us', // Google Flights dal mercato USA: si parte da Denver
      // Auto propria fino a DEN (benzina non stimata) + Pikes Peak lot 10 $/giorno × 14 giorni (tariffa 2025, da riverificare).
      accesso: { DEN: { auto: 0, parcheggio: 140 } },
      // Per confronto: ritorno da Missoula o da Bozeman (public/<slug>/voli-mso.csv, voli-bzn.csv).
      alternative: [
        {
          id: 'mso',
          nome: 'Ritorno da Missoula',
          // ore di auto da OSRM
          descrizione:
            'Si riparte da Missoula, con l’auto riconsegnata lì: l’ultimo giorno circa 5 ore e 15 di auto da Many Glacier, senza il giro di Two Medicine, invece delle 3 ore e 15 fino a Kalispell passando da Two Medicine.',
          andata: { da: ['DEN'], a: ['JAC'], date: ['2027-07-20'] },
          ritorno: { da: ['MSO'], a: ['DEN'], date: ['2027-08-02'] },
        },
        {
          id: 'bzn',
          nome: 'Ritorno da Bozeman',
          descrizione:
            'Si torna a Bozeman, dove l’auto è stata ritirata: l’ultimo giorno circa 6 ore e 20 di auto da Many Glacier, senza il giro di Two Medicine, invece delle 3 ore e 15 fino a Kalispell passando da Two Medicine.',
          andata: { da: ['DEN'], a: ['JAC'], date: ['2027-07-20'] },
          ritorno: { da: ['BZN'], a: ['DEN'], date: ['2027-08-02'] },
        },
      ],
    },
    alloggi: {
      attivo: false,
      adulti: 2,
      camere: 1,
      bagni: 1,
      // Per due basta un'unità: monolocali (0 camere) e camere d'albergo senza conteggio non si scartano.
      monolocali: true,
      fonti: ['airbnb', 'booking'],
      // Booking: anche hotel, B&B, guest house, lodge e inn (come Big Island): sul lato est le case sono poche.
      tipi: ['201', '220', '204', '208', '216', '221', '218'],
      paese: 'us',
      raggioKm: 25,
      tappe: [
        {
          // Centro tra Columbia Falls e West Glacier: Hungry Horse, Coram, Martin City.
          id: 'ovest', nome: 'West Glacier', q: 'West Glacier, Montana, USA', centro: [48.43, -114.05], dal: '2027-07-29', al: '2027-07-31',
          nota: 'Lato ovest del parco: cerco tra Columbia Falls, Hungry Horse e West Glacier.',
        },
        {
          id: 'est', nome: 'St. Mary', q: 'St. Mary, Montana, USA', centro: [48.745, -113.43], raggioKm: 40, dal: '2027-07-31', al: '2027-08-02',
          nota: 'Prima scelta: dormire dentro Many Glacier (Many Glacier Hotel o Swiftcurrent Motor Inn, solo su glaciernationalparklodges.com, con mesi di anticipo). Qui cerco il ripiego entro 40 km: St. Mary, Babb, East Glacier.',
        },
      ],
    },
    costi: {
      coppie: 1,
      // Il SUV a 7 posti si riconsegna a Bozeman il 29 (sta nel conto del viaggio breve).
      noleggio: { voce: 'Noleggio auto media, Bozeman (BZN) → Kalispell (FCA), 29 luglio – 2 agosto, solo andata', importo: null },
      // km da OSRM (somma dei giorni 10–14); auto media ~8 l/100 km; benzina Montana ~3,80 $/gal ≈ 1,00 $/l (stima).
      carburante: { km: 992, litriPer100: 8, prezzoLitro: 1 },
      // Ingressi ai parchi nazionali esclusi: coperti dal pass America the Beautiful.
      extra: [
        { voce: 'Battelli di Many Glacier, Glacier Park Boat Co. (2 × ~40 $, andata e ritorno, da verificare)', importo: 80 },
      ],
      // Costi degli scenari di voli.alternative (stessi litri e prezzo al litro, km diversi).
      alternative: {
        mso: {
          noleggio: { voce: 'Noleggio auto media, Bozeman (BZN) → Missoula (MSO), 29 luglio – 2 agosto, solo andata', importo: null },
          carburante: { km: 1148 }, // km da OSRM: giorni 10–13 come il principale, poi Many Glacier → Missoula diretto
        },
        bzn: {
          noleggio: { voce: 'Noleggio auto media, Bozeman (BZN) andata e ritorno, 29 luglio – 2 agosto', importo: null },
          carburante: { km: 1273 }, // km da OSRM: giorni 10–13 come il principale, poi Many Glacier → Bozeman diretto
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
