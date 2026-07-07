import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgFetch } from '../../lib/client.js'
import { tokens } from '../../lib/context.js'

// Operation app-data surface (export/import + table introspection). Export/import
// are gated behind VG_EXPERIMENTAL_APPDATA (ON in this harness — run.js sets it so
// these endpoints stay exercised even though seeding is direct SQL); the table
// list only needs elevation.
test('GET /op/appdata requires elevation -> 403 even for admin without elevate', async () => {
  const { status } = await vgFetch('/op/appdata', { token: tokens.users.admin })
  assert.equal(status, 403)
})

test('GET /op/appdata as admin+elevate exports JSONL', async () => {
  const { status, text, res } = await vgFetch('/op/appdata', {
    token: tokens.users.admin, query: { elevate: 'true', format: 'jsonl' },
  })
  assert.equal(status, 200)
  assert.match(res.headers.get('content-type'), /application\/jsonl/)
  assert.match(res.headers.get('content-disposition'), /attachment/)
  const lines = text.split('\n').filter(Boolean)
  assert.ok(lines.length > 0, 'export streams at least one JSONL record')
  assert.doesNotThrow(() => JSON.parse(lines[0]), 'first line is valid JSON')
})

test('POST /op/appdata (import) requires application/jsonl -> 415 for a json body', async () => {
  // vgFetch sends application/json; the import endpoint only accepts
  // application/jsonl, so the media-type check rejects it before anything else.
  const { status } = await vgFetch('/op/appdata', {
    token: tokens.users.admin, query: { elevate: 'true' }, method: 'POST', body: {},
  })
  assert.equal(status, 415)
})

test('GET /op/appdata/tables requires elevation -> 403 for a non-elevated caller', async () => {
  const { status } = await vgFetch('/op/appdata/tables', { token: tokens.users.full_v1 })
  assert.equal(status, 403)
})

test('GET /op/appdata/tables as admin with elevate=true -> 200', async () => {
  const { status } = await vgFetch('/op/appdata/tables', { token: tokens.users.admin, query: { elevate: 'true' } })
  assert.equal(status, 200)
})
