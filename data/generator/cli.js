import { config } from './env.js'
import { withDb } from './db.js'
import { TABLE_ORDER } from './constants.js'
import { buildDataset, loadContent } from './data.js'
import { seedSql } from './seed-sql.js'
import { buildJsonl, columnMapFromDb } from './emit-appdata.js'
import { columnMetaFromDb, analyzeDrift, loadBaseline } from './doctor.js'
import { mintToken, importAppData } from './load-appdata.js'
import { writeFileSync, readFileSync } from 'node:fs'

const args = process.argv.slice(2)
const has = (f) => args.some(a => a === f || a.startsWith(f + '='))
const val = (f, d) => { const a = args.find(x => x.startsWith(f + '=')); return a ? a.split('=')[1] : d }

async function emitJsonl (dataset) {
  // need live column order (excludes generated cols) -> requires the dev DB schema present
  const { columnMap, lastMigration } = await withDb(async (conn) => {
    const cMap = await columnMapFromDb(conn, TABLE_ORDER)
    let lm = 6 // sensible fallback if _migrations table is absent
    try {
      const [[row]] = await conn.query('SELECT COUNT(*) AS n FROM `_migrations`')
      if (row && typeof row.n === 'number' && row.n > 0) lm = row.n
    } catch { /* table may not exist in some test environments */ }
    return { columnMap: cMap, lastMigration: lm }
  })
  const meta = { version: '1.0.0-demo', commit: { branch: 'na', sha: 'na', tag: 'na', describe: 'na' },
    date: '2026-06-30T12:00:00.000Z', lastMigration }
  return buildJsonl(dataset, columnMap, meta)
}

async function sanity () {
  const r = await withDb(async (conn) => {
    const [[c]] = await conn.query(`SELECT
      (SELECT COUNT(*) FROM village) v,
      (SELECT COUNT(*) FROM member) m,
      (SELECT COUNT(*) FROM member WHERE status = 'Active') am,
      (SELECT COUNT(*) FROM volunteer) vol,
      (SELECT COUNT(*) FROM volunteer WHERE active = 1) avol,
      (SELECT COUNT(*) FROM service_request) sr,
      (SELECT COUNT(*) FROM service_request WHERE status IN ('Confirmed','Completed') AND volunteer_person_id IS NULL) bad`)
    return c
  })
  if (r.v !== 10) throw new Error(`expected 10 villages, got ${r.v}`)
  if (r.bad !== 0) throw new Error(`${r.bad} Confirmed/Completed requests have no volunteer`)
  if (!(r.am < r.m) || !(r.avol < r.vol)) throw new Error('active views should filter some rows')
  console.log('sanity OK:', r)
}

// Schema-drift check — runs before every command so renamed/dropped columns,
// new required columns, and new UNACKNOWLEDGED columns all fail here, with
// names, not mid-load with a SQL error. Known-unset columns live (with
// reasons) in doctor-baseline.json.
async function doctor (dataset) {
  const meta = await withDb((conn) => columnMetaFromDb(conn, TABLE_ORDER))
  const { errors, notices, acknowledged } = analyzeDrift(meta, dataset, TABLE_ORDER, loadBaseline())
  for (const n of notices) console.log('doctor notice:', n)
  if (errors.length) throw new Error('schema drift detected:\n  - ' + errors.join('\n  - '))
  console.log(`doctor OK: ${TABLE_ORDER.length} tables checked, ${acknowledged} acknowledged-unset column(s)`)
}

const dataset = buildDataset(loadContent(), config.seed)
await doctor(dataset)

if (has('--sql') || args.length === 0) {
  console.log('SQL seed:', await seedSql(dataset))
  await sanity()
}
if (has('--emit')) {
  const out = val('--emit', 'demo-appdata.jsonl')
  writeFileSync(out, await emitJsonl(dataset))
  console.log('wrote', out)
}
if (has('--import')) {
  const path = val('--import', 'demo-appdata.jsonl')
  const jsonl = (has('--import') && val('--import', null)) ? readFileSync(path, 'utf8') : await emitJsonl(dataset)
  const token = await mintToken()
  console.log(await importAppData(config.api.base, token, jsonl))
}
if (has('--roundtrip')) {
  console.log('SQL seed:', await seedSql(dataset))
  const jsonl = await emitJsonl(dataset)
  const token = await mintToken()
  console.log('import result:', await importAppData(config.api.base, token, jsonl))
  await sanity()
}
