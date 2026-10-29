import { viaggi } from './viaggi.js'

function App() {
  return (
    <main className="pagina">
      <header>
        <h1>Viaggi</h1>
        <p className="sottotitolo">I nostri itinerari, giorno per giorno.</p>
      </header>

      <ul className="elenco">
        {viaggi.map((v) => (
          <li key={v.slug}>
            <a className="scheda" href={`${import.meta.env.BASE_URL}${v.slug}/`}>
              <h2>{v.titolo}</h2>
              <p className="date">{v.date}</p>
              <p className="luoghi">{v.luoghi}</p>
              {v.nota && <p className="nota">{v.nota}</p>}
            </a>
          </li>
        ))}
      </ul>
    </main>
  )
}

export default App
