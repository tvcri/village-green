// Helpers for the /op/appdata endpoints (admin + elevate, JSONL format).
//
// CAUTION: importAppData TRUNCATES and reloads every table present in the
// payload. Importing the current state (the round-trip test) is safe; a test
// that imports special-purpose appdata must restore the canonical state
// afterward — either by re-importing an export taken beforehand, or the file
// must contain the canonical rows for every table it touches.
import { vgFetch } from './client.js'

// Returns the JSONL export as a string.
export async function exportAppData (token) {
  const { status, text } = await vgFetch('/op/appdata', {
    token, query: { elevate: 'true', format: 'jsonl' },
  })
  if (status !== 200) throw new Error(`appdata export failed with status ${status}`)
  return text
}

// Imports a JSONL payload. Returns {status, progress} where progress is the
// parsed stream of progress records the API writes; a successful import ends
// with {status: 'success'}.
export async function importAppData (token, jsonl) {
  const { status, text } = await vgFetch('/op/appdata', {
    token, method: 'POST', query: { elevate: 'true' },
    rawBody: jsonl, contentType: 'application/jsonl',
  })
  const progress = text.split('\n').filter(Boolean).map(l => {
    try { return JSON.parse(l) } catch { return { raw: l } }
  })
  return { status, progress }
}

// Parses an export into its parts. Format (one JSON value per line):
//   line 1: {version, commit, date, lastMigration}       (metadata; date varies)
//   line 2: {tables: [{table, rowCount}...], totalRows}   (summary)
//   then per table: {table, columns, rowCount} followed by one array per row
// Row lines are kept as raw strings (compare/sort without reparsing);
// columns maps table -> the export's backtick-quoted column list string.
export function parseAppData (jsonl) {
  const lines = jsonl.split('\n').filter(Boolean)
  const meta = JSON.parse(lines[0])
  const summary = JSON.parse(lines[1])
  const tables = new Map()
  const columns = new Map()
  let current = null
  for (const line of lines.slice(2)) {
    if (line.startsWith('[')) {
      tables.get(current).push(line)
    } else {
      const rec = JSON.parse(line)
      current = rec.table
      tables.set(current, [])
      columns.set(current, rec.columns)
    }
  }
  return { meta, summary, tables, columns }
}
