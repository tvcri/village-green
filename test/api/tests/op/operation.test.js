import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgFetch } from '../../lib/client.js'
import { tokens } from '../../lib/context.js'

// Operation app-data surface (export/import + table introspection). Export/import
// are gated behind VG_EXPERIMENTAL_APPDATA (off in this harness); the table list
// only needs elevation.
test('GET /op/appdata is disabled unless VG_EXPERIMENTAL_APPDATA=true -> 404', async () => {
  // The experimental gate is checked first, so even admin+elevate gets 404.
  const { status } = await vgFetch('/op/appdata', { token: tokens.users.admin, query: { elevate: 'true' } })
  assert.equal(status, 404)
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
