// Parti comuni agli script che interrogano SerpApi (voli.mjs, alloggi.mjs):
// chiamata con retry, errori fatali, CSV append-only con migrazione dell'intestazione.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'

export const ENDPOINT = 'https://serpapi.com/search.json'
export const TIMEOUT_MS = 60000
export const RITARDO_RETRY_MS = 5000

export class ErroreFatale extends Error {}

export const logConsole = {
  info: (m) => console.log(m),
  warn: (m) => console.log('::warning::' + m),
  error: (m) => console.log('::error::' + m),
}

const dorme = (ms) => new Promise((r) => setTimeout(r, ms))

/** Parametri in chiaro per i log, con la chiave oscurata. */
export function oscurata(params) {
  const p = new URLSearchParams(params)
  if (p.has('api_key')) p.set('api_key', '***')
  return p.toString()
}

/** Istante dell'esecuzione in ISO UTC senza millisecondi (da `now`, es. VOLI_NOW). */
export function adesso(now, nomeVar = 'la data') {
  const d = now ? new Date(now) : new Date()
  if (Number.isNaN(d.getTime())) throw new ErroreFatale(nomeVar + ' non è una data valida: ' + now)
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

/** Una riga CSV, con le virgolette solo dove servono (RFC 4180). */
export function csvRiga(arr) {
  return arr
    .map((v) => {
      const s = v == null ? '' : String(v)
      return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
    })
    .join(',')
}

/** CSV → array di righe (array di stringhe). Gestisce virgolette, "", CRLF. */
export function parseCSV(text) {
  const rows = []
  let row = []
  let f = ''
  let q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        f += '"'
        i++
      } else if (c === '"') q = false
      else f += c
    } else if (c === '"') q = true
    else if (c === ',') {
      row.push(f)
      f = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(f)
      rows.push(row)
      row = []
      f = ''
    } else f += c
  }
  if (f !== '' || row.length) {
    row.push(f)
    rows.push(row)
  }
  return rows
}

/**
 * Una ricerca SerpApi.
 * Ritorna { stato: 'ok' | 'vuoto' | 'fallito', json?, motivo? }; lancia ErroreFatale
 * per chiave non valida, limite superato o richiesta sbagliata.
 * `conta(json)` = numero di risultati utili: con un `error` e 0 risultati la ricerca è "vuota".
 */
export async function cerca(params, { fetchImpl = fetch, ritardoRetry = RITARDO_RETRY_MS, conta = () => 0 } = {}) {
  let motivo = ''
  for (let tentativo = 0; tentativo < 2; tentativo++) {
    if (tentativo) await dorme(ritardoRetry)
    let res
    let json = null
    try {
      res = await fetchImpl(ENDPOINT + '?' + params.toString(), { signal: AbortSignal.timeout(TIMEOUT_MS) })
      try {
        json = await res.json()
      } catch {
        json = null
      }
    } catch (e) {
      motivo = 'errore di rete: ' + (e?.message || e)
      continue
    }
    const errore = typeof json?.error === 'string' ? json.error : ''
    if (res.status === 401 || res.status === 403 || /api key/i.test(errore)) {
      throw new ErroreFatale('chiave SerpApi non valida o non autorizzata (HTTP ' + res.status + ')')
    }
    if (res.status === 429) throw new ErroreFatale('limite di ricerche SerpApi superato (HTTP 429): ' + errore)
    if (res.status === 400) {
      throw new ErroreFatale('richiesta rifiutata (HTTP 400): ' + errore + ' — parametri: ' + oscurata(params))
    }
    if (res.status >= 500 || !res.ok || json == null || json?.search_metadata?.status === 'Error') {
      motivo = 'HTTP ' + res.status + (errore ? ': ' + errore : '')
      continue
    }
    if (errore && conta(json) === 0) return { stato: 'vuoto', json, motivo: errore }
    return { stato: 'ok', json }
  }
  return { stato: 'fallito', motivo }
}

/**
 * Accoda le righe al CSV senza mai lasciarlo a metà (.tmp + rename).
 * - file assente o vuoto: scrive l'intestazione;
 * - intestazione uguale: accoda;
 * - intestazione in `precedenti` (prefisso di quella nuova): riscrive il file con la
 *   nuova intestazione e le vecchie righe allungate con colonne vuote, poi accoda;
 * - altrimenti errore, file invariato.
 */
export function scriviCsv(file, header, rows, precedenti = []) {
  const intestazione = header.join(',')
  let prima = existsSync(file) ? readFileSync(file, 'utf8') : ''
  if (prima !== '') {
    const riga1 = prima.split(/\r?\n/, 1)[0]
    const vecchio = precedenti.find((h) => h.join(',') === riga1)
    if (vecchio && vecchio.length < header.length && header.slice(0, vecchio.length).join(',') === riga1) {
      const vecchie = parseCSV(prima).slice(1).filter((r) => r.length > 1 || r[0] !== '')
      const pad = header.length - vecchio.length
      prima = [intestazione, ...vecchie.map((r) => csvRiga([...r, ...Array(pad).fill('')]))].join('\n') + '\n'
    } else if (riga1 !== intestazione) {
      throw new Error(file + ': intestazione diversa da quella attesa, non scrivo nulla')
    } else if (!prima.endsWith('\n')) {
      prima += '\n'
    }
  } else {
    prima = intestazione + '\n'
  }
  mkdirSync(path.dirname(file), { recursive: true })
  const tmp = file + '.tmp'
  writeFileSync(tmp, prima + rows.map(csvRiga).join('\n') + (rows.length ? '\n' : ''))
  renameSync(tmp, file)
}
