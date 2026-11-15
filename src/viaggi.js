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
// - `zona` (facoltativa): paese della voce per il conto diviso per paese, su tappe di `alloggi`, tratte di
//   `voli.ospiti` (il paese in cui si atterra) e righe di `costi.extra` (dove si fa l'attività). Non è `paese`,
//   che per gli alloggi è il filtro del paese di Booking. Andata e ritorno e accesso restano senza zona.
// Date e tappe già passate vengono saltate. I due budget di ricerche (voli e
// alloggi) sono separati e condivisi tra i viaggi attivi. Un viaggio con
// `attivo: false` non entra mai nello schedule, ma `--slug <slug>` lo cerca lo
// stesso, una volta (workflow «Prezzi voli e alloggi», input `slug`).
export const viaggi = [
  {
    slug: 'sudamerica-2028',
    titolo: 'Il grand tour del Sud America',
    date: '7 aprile – 22 maggio 2028',
    luoghi: 'Patagonia, Iguazú, Lençóis, Uyuni, Titicaca, Machu Picchu, Antigua, Galápagos',
    // Viaggio in dollari: i bot cercano in USD e la pagina mostra in USD.
    valuta: 'USD',
    // Niente ricerca periodica: una sola rilevazione lanciata a mano con --slug (workflow, input slug).
    // Google Flights mostra i voli solo ~330 giorni avanti: fino a circa maggio 2027 i voli di aprile 2028
    // non ci sono ancora e la pagina li segna «da rilevare»; gli alloggi si possono già cercare.
    voli: {
      attivo: false,
      adulti: 2,
      // Open-jaw: si arriva in Patagonia (Punta Arenas, o Puerto Natales se il volo stagionale c'è) e si torna dalle Galápagos via Guayaquil.
      andata: { da: ['DEN'], a: ['PUQ', 'PNT'], date: ['2028-04-07'] }, // volo notturno via Santiago, arrivo sabato 8
      ritorno: { da: ['GYE'], a: ['DEN'], date: ['2028-05-22'] },
      gl: 'us', // Google Flights dal mercato USA: si parte da Denver
      // Stime (totale per due, USD) finché Google Flights non mostra le date: la pagina le usa al posto del prezzo
      // rilevato e le segna come stime. Criterio: tariffe più basse viste su Kayak/Expedia/Momondo il 2026-11-15
      // per la stessa tratta di sola andata, arrotondate in su (~+15–25%) per orari comodi e per il 2028.
      // Andata: Kayak DEN → PUQ ~651 $ (Expedia LATAM 639 $, Momondo 673 $); ritorno: Kayak GYE → DEN ~290 $
      // (Orbitz da 220 $). ≈ 2 × (750 + 350).
      stima: 2200,
      // Uber per DEN andata e ritorno (~60 $ a tratta, stima): 46 giorni di parcheggio costerebbero ~460 $.
      accesso: { DEN: { auto: 60, parcheggio: 0 } },
      // I voli interni sono biglietti di sola andata separati: una ricerca per tratta (righe tipo=ospiti nel CSV).
      ospiti: [
        // `stima` = totale per due (USD), stesso criterio di voli.stima (ricerca del 2026-11-15).
        // `zona` = il paese in cui si atterra.
        // Expedia AR da 146 $, FareCompare media 158 $
        { id: 'fte-igr', voce: 'Volo interno, El Calafate → Iguazú (via Buenos Aires)', adulti: 2, da: ['FTE'], a: ['IGR'], date: ['2028-04-16'], stima: 340, zona: 'Argentina' },
        // Trip.com da 135 $, Booking 157–163 $ (direzione opposta); dopo Pasqua
        { id: 'igu-slz', voce: 'Volo interno, Foz do Iguaçu → São Luís', adulti: 2, da: ['IGU'], a: ['SLZ'], date: ['2028-04-18'], stima: 380, zona: 'Brasile' },
        // Momondo da R$ 1.270 (~230 $), LATAM con scalo a San Paolo
        { id: 'slz-scl', voce: 'Volo, São Luís → Santiago del Cile (via San Paolo)', adulti: 2, da: ['SLZ'], a: ['SCL'], date: ['2028-04-22'], stima: 600, zona: 'Cile' },
        // Kayak 33–71 $, Momondo 60 $ (Sky, JetSMART, LATAM), bagaglio a parte sulle low cost
        { id: 'scl-cjc', voce: 'Volo interno, Santiago → Calama (per San Pedro de Atacama)', adulti: 2, da: ['SCL'], a: ['CJC'], date: ['2028-04-23'], stima: 160, zona: 'Cile' },
        // BoA diretto ~84 $ (flightconnections.com)
        { id: 'uyu-lpb', voce: 'Volo interno, Uyuni → La Paz', adulti: 2, da: ['UYU'], a: ['LPB'], date: ['2028-04-28'], stima: 200, zona: 'Bolivia' },
        // Trip.com da 239 $, Expedia da 250 $, Kiwi 216–277 $
        { id: 'cuz-gua', voce: 'Volo, Cusco → Città del Guatemala (via Lima)', adulti: 2, da: ['CUZ'], a: ['GUA'], date: ['2028-05-09'], stima: 600, zona: 'Guatemala' },
        // Travelocity Copa 275–291 $, copaair.com da 368 $
        { id: 'gua-gye', voce: 'Volo, Città del Guatemala → Guayaquil (via Panamá)', adulti: 2, da: ['GUA'], a: ['GYE'], date: ['2028-05-13'], stima: 700, zona: 'Ecuador e Galápagos' },
        // LATAM da 116 $ (maggio 2026), Trip.com 121 $, Momondo 180 $
        { id: 'gye-gps', voce: 'Volo interno, Guayaquil → Galápagos (Baltra)', adulti: 2, da: ['GYE'], a: ['GPS'], date: ['2028-05-14'], stima: 360, zona: 'Ecuador e Galápagos' },
        // Travelocity GYE → SCY 159 $, FareCompare media 146 $; stessi prezzi nelle due direzioni (voyagers.travel)
        { id: 'scy-gye', voce: 'Volo interno, San Cristóbal (Galápagos) → Guayaquil', adulti: 2, da: ['SCY'], a: ['GYE'], date: ['2028-05-21'], stima: 360, zona: 'Ecuador e Galápagos' },
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
      // Niente `paese`: sette paesi diversi; i risultati del paese sbagliato li scarta già il raggio dal centro.
      raggioKm: 10,
      // `stimaNotte` = USD a notte per la camera doppia, livello comfort da luna di miele (hotel con voto 8+ in centro,
      // non lusso e non il più economico), finché Booking non risponde per date così lontane. Criterio: prezzi visti
      // su Booking/Kayak/Momondo/Expedia nella ricerca del 2026-11-15 per aprile–maggio, arrotondati in su per il 2028.
      tappe: [
        // stima: hotel 8+ in centro ~150 $ (nessun listino trovato: da verificare)
        { id: 'natales', nome: 'Puerto Natales', q: 'Puerto Natales, Chile', centro: [-51.7308, -72.497], dal: '2028-04-08', al: '2028-04-09', stimaNotte: 170, zona: 'Cile' },
        {
          // Hotel Lago Grey: 333 $ (Orbitz, maggio 2026) – ~500 $ in alta stagione; solo camera, senza pensione completa
          id: 'paine', nome: 'Torres del Paine', q: 'Torres del Paine, Chile', centro: [-51.0, -72.9], raggioKm: 40, dal: '2028-04-09', al: '2028-04-11', stimaNotte: 420, zona: 'Cile',
          nota: 'Hotel dentro il parco: cerco entro 40 km dal centro, così entrano sia la zona di Las Torres sia quella del Pehoé e del Grey.',
        },
        // voto 8,9–9,5: Destino Calafate da 116 $, Calafate Parque 140 $, El Quijote 153 $
        { id: 'calafate', nome: 'El Calafate', q: 'El Calafate, Argentina', centro: [-50.3379, -72.2648], dal: '2028-04-11', al: '2028-04-13', stimaNotte: 170, zona: 'Argentina' },
        // Booking: 3 stelle ~135 $, 4 stelle ~249 $
        { id: 'chalten', nome: 'El Chaltén', q: 'El Chaltén, Argentina', centro: [-49.3315, -72.8863], raggioKm: 8, dal: '2028-04-13', al: '2028-04-16', stimaNotte: 180, zona: 'Argentina' },
        // Skyscanner: 4 stelle ~88 €, 5 stelle ~155 €
        { id: 'iguazu', nome: 'Puerto Iguazú', q: 'Puerto Iguazú, Argentina', centro: [-25.5972, -54.5786], raggioKm: 20, dal: '2028-04-16', al: '2028-04-18', stimaNotte: 150, zona: 'Argentina' },
        // stima: hotel 8+ nel centro storico o a Ponta d'Areia
        { id: 'sao-luis', nome: 'São Luís', q: 'São Luís, Brazil', centro: [-2.5307, -44.3068], raggioKm: 15, dal: '2028-04-18', al: '2028-04-19', stimaNotte: 100, zona: 'Brasile' },
        // pousadas sul fiume 105–145 $ (Kayak, Momondo), weekend di Tiradentes
        { id: 'barreirinhas', nome: 'Barreirinhas', q: 'Barreirinhas, Brazil', centro: [-2.747, -42.8264], raggioKm: 15, dal: '2028-04-19', al: '2028-04-22', stimaNotte: 140, zona: 'Brasile' },
        {
          // stima: hotel di catena davanti al terminal
          id: 'santiago', nome: 'Santiago, aeroporto', q: 'Santiago airport, Chile', centro: [-33.393, -70.786], raggioKm: 8, vicino: 'aeroporto di Santiago',
          dal: '2028-04-22', al: '2028-04-23', stimaNotte: 180, zona: 'Cile',
        },
        // Hotel Desertica, Quechua 160–277 $, Cumbres ~248 $
        { id: 'san-pedro', nome: 'San Pedro de Atacama', q: 'San Pedro de Atacama, Chile', centro: [-22.9087, -68.1997], raggioKm: 8, dal: '2028-04-23', al: '2028-04-25', stimaNotte: 230, zona: 'Cile' },
        {
          // stima: hotel di sale o hotel 8+ in paese
          id: 'uyuni', nome: 'Uyuni', q: 'Uyuni, Bolivia', centro: [-20.4597, -66.8261], raggioKm: 30, dal: '2028-04-27', al: '2028-04-28', stimaNotte: 140, zona: 'Bolivia',
          nota: 'Le due notti prima (25 e 26 aprile) sono comprese nel tour di gruppo da San Pedro: un rifugio spartano a ~4.300 m e un hotel di sale.',
        },
        // stima: hotel 8+ a Sopocachi o San Jorge
        { id: 'la-paz', nome: 'La Paz', q: 'La Paz, Bolivia', centro: [-16.5, -68.1193], dal: '2028-04-28', al: '2028-04-29', stimaNotte: 130, zona: 'Bolivia' },
        {
          // stima: ecolodge di Yumani con vista sul lago
          id: 'isla-del-sol', nome: 'Isla del Sol', q: 'Copacabana, Bolivia', centro: [-16.1661, -69.0861], raggioKm: 20, vicino: 'Copacabana',
          dal: '2028-04-29', al: '2028-04-30', stimaNotte: 110, zona: 'Bolivia',
          nota: 'Si dorme a Yumani, sull’isola: cerco entro 20 km da Copacabana, che comprende l’isola.',
        },
        // Il treno PeruRail Titicaca parte da Puno lunedì, giovedì e sabato (orario 2025): lunedì 1° maggio.
        // stima: hotel 8+ sul lago o in centro
        { id: 'puno', nome: 'Puno', q: 'Puno, Peru', centro: [-15.8402, -70.0219], dal: '2028-04-30', al: '2028-05-01', stimaNotte: 130, zona: 'Perù' },
        // boutique in centro: da ~66 $ a 255–317 $ per i 4,5 stelle; comfort ~170 $
        { id: 'cusco', nome: 'Cusco', q: 'Cusco, Peru', centro: [-13.517, -71.9785], raggioKm: 5, dal: '2028-05-01', al: '2028-05-06', stimaNotte: 170, zona: 'Perù' },
        // stima: hotel con giardino in valle (i resort di lusso costano il doppio)
        { id: 'urubamba', nome: 'Urubamba', q: 'Urubamba, Peru', centro: [-13.3047, -72.116], raggioKm: 20, dal: '2028-05-06', al: '2028-05-07', stimaNotte: 160, zona: 'Perù' },
        {
          // guida aprile 2026 (Yapa Explorers): fascia media 50–150 $, premium 150–350 $
          id: 'aguas-calientes', nome: 'Aguas Calientes', q: 'Machu Picchu Pueblo, Peru', centro: [-13.1547, -72.5254], raggioKm: 3,
          dal: '2028-05-07', al: '2028-05-08', stimaNotte: 200, zona: 'Perù',
        },
        { id: 'cusco-2', nome: 'Cusco', q: 'Cusco, Peru', centro: [-13.517, -71.9785], raggioKm: 5, dal: '2028-05-08', al: '2028-05-09', stimaNotte: 170, zona: 'Perù' },
        {
          // stima: hotel boutique 8+ in centro (nessun listino trovato: da verificare)
          id: 'antigua', nome: 'Antigua', q: 'Antigua Guatemala', centro: [14.5586, -90.7295], raggioKm: 6, dal: '2028-05-09', al: '2028-05-13', stimaNotte: 160, zona: 'Guatemala',
          nota: 'La notte sull’Acatenango teniamo la stanza per i bagagli.',
        },
        {
          // stima: hotel di catena vicino al terminal
          id: 'guayaquil', nome: 'Guayaquil, aeroporto', q: 'Guayaquil airport, Ecuador', centro: [-2.1574, -79.8837], raggioKm: 6, vicino: 'aeroporto di Guayaquil',
          dal: '2028-05-13', al: '2028-05-14', stimaNotte: 150, zona: 'Ecuador e Galápagos',
        },
        // Puerto Ayora 80–280 $ (Solymar sul Malecón 110–170 $); comfort ~220 $
        { id: 'santa-cruz', nome: 'Santa Cruz', q: 'Puerto Ayora, Galápagos', centro: [-0.7432, -90.3134], vicino: 'Puerto Ayora', dal: '2028-05-14', al: '2028-05-16', stimaNotte: 220, zona: 'Ecuador e Galápagos' },
        // Puerto Villamil 50–180 $, Isabela Island Hotel sulla spiaggia 125–185 $
        { id: 'isabela', nome: 'Isabela', q: 'Puerto Villamil, Galápagos', centro: [-0.9564, -90.9667], raggioKm: 8, vicino: 'Puerto Villamil', dal: '2028-05-16', al: '2028-05-18', stimaNotte: 180, zona: 'Ecuador e Galápagos' },
        // Puerto Baquerizo Moreno 60–240 $, ~20–30% meno di Santa Cruz
        {
          id: 'san-cristobal', nome: 'San Cristóbal', q: 'Puerto Baquerizo Moreno, Galápagos', centro: [-0.9017, -89.6103], raggioKm: 6, vicino: 'Puerto Baquerizo Moreno',
          dal: '2028-05-18', al: '2028-05-21', stimaNotte: 170, zona: 'Ecuador e Galápagos',
        },
        {
          id: 'guayaquil-2', nome: 'Guayaquil, aeroporto', q: 'Guayaquil airport, Ecuador', centro: [-2.1574, -79.8837], raggioKm: 6, vicino: 'aeroporto di Guayaquil',
          dal: '2028-05-21', al: '2028-05-22', stimaNotte: 150, zona: 'Ecuador e Galápagos',
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
        // andina.pe (tariffe 2026), circuito 3-A con Huayna Picchu
        { voce: 'Machu Picchu con Huayna Picchu, guida obbligatoria e bus Consettur', importo: 230, zona: 'Perù' },
        { voce: 'Treno Ollantaytambo ↔ Aguas Calientes, Vistadome andata e ritorno', importo: 360, zona: 'Perù' },
        { voce: 'Valle Sacra con autista e boleto turístico', importo: 190, zona: 'Perù' },
        // Guida di terzi (maggio 2026): da ~270 $ a testa in economy, +25% in alta stagione; Magpie da 205 $.
        // perurail.com non pubblica le tariffe fuori dal motore di prenotazione: verificare lì.
        { voce: 'Treno PeruRail Titicaca, Puno → Cusco (2 × ~270 $, pasti compresi)', importo: 540, zona: 'Perù' },
        // TourRadar: gruppo piccolo ~98 $ a testa (2026); i gruppi grandi partono da ~40 $; ingresso e cavallo a parte se non compresi.
        { voce: 'Laguna Humantay, gita in giornata da Cusco in gruppo piccolo (2 × ~100 $)', importo: 200, zona: 'Perù' },
        // TourRadar: ~100 $ a testa con l'ingresso (S/ 25–30 alla comunità); cavallo ~30 $ facoltativo.
        { voce: 'Montagna Arcobaleno (Vinicunca), gita in giornata da Cusco con l’ingresso (2 × ~100 $)', importo: 200, zona: 'Perù' },
        // nomades.com: Nomades CLP 219.000 a testa; parchi boliviani Avaroa 150 Bs e Incahuasi 30 Bs
        { voce: 'Uyuni, tour di gruppo di 3 giorni da San Pedro e ingressi ai parchi boliviani', importo: 525, zona: 'Bolivia' },
        { voce: 'San Pedro de Atacama: due gite (Valle de la Luna, lagune altiplaniche) e transfer da Calama', importo: 250, zona: 'Cile' },
        { voce: 'Titicaca: bus La Paz → Copacabana, barca e tasse dell’Isla del Sol, bus per Puno', importo: 110, zona: 'Bolivia' },
        { voce: 'Acatenango, salita con notte al campo (2 × ~110 $) e tassa del parco', importo: 240, zona: 'Guatemala' },
        // argentina.gob.ar/parquesnacionales/tarifas
        { voce: 'Perito Moreno: ingresso (2 × ARS 50.000), barca e transfer', importo: 230, zona: 'Argentina' },
        // nuove tariffe CONAF dal 1/5/2026, pasesparques.cl
        { voce: 'Torres del Paine, ingresso al parco', importo: 100, zona: 'Cile' },
        { voce: 'Transfer privato Torres del Paine → Cerro Castillo → El Calafate', importo: 450, zona: 'Argentina' },
        { voce: 'Bus El Calafate → El Chaltén e navetta El Chaltén → aeroporto di El Calafate', importo: 170, zona: 'Argentina' },
        { voce: 'Iguazú: lato argentino (2 × ARS 60.000) e lato brasiliano', importo: 130, zona: 'Argentina' },
        { voce: 'Lençóis: transfer São Luís ↔ Barreirinhas e due gite (Lagoa Azul, Rio Preguiças)', importo: 230, zona: 'Brasile' },
        // giorno di riserva: se il tempo regge, Atins e le lagune dall'altro lato in 4x4 (stima, gite condivise ~R$ 300 a testa)
        { voce: 'Lençóis, giorno di riserva: Atins e le lagune in 4x4 (facoltativo, 2 × ~60 $)', importo: 120, zona: 'Brasile' },
        { voce: 'Navetta aeroporto di Città del Guatemala ↔ Antigua', importo: 60, zona: 'Guatemala' },
        // nomades.com: navetta condivisa dall'aeroporto di Punta Arenas da CLP 17.000 a testa;
        // transfer privato Natales → parco CLP 80.000–150.000 a veicolo (dicaschile.com.br); navetta per Las Torres ~CLP 4.000.
        { voce: 'Bus Punta Arenas → Puerto Natales, transfer Natales → hotel nel parco con le soste, navette nel parco', importo: 210, zona: 'Cile' },
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
    nota: 'Prolungamento del viaggio in sei: solo per chi ospita',
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
