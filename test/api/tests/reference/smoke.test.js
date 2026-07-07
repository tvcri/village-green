import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgFetch } from '../../lib/client.js'
import { tokens } from '../../lib/context.js'

// Reference-data smokes: the read-only lookup lists behind the person and
// volunteer forms. All four are gated by vg:person:read (the readOnly token
// suffices). Only `capability` ships static rows; the other tables start empty
// in the scaffolded test schema, so their smokes assert shape, not content.
const ENDPOINTS = ['/communities', '/disabilities', '/capabilities', '/vetting-types']

test('reference lists require authentication', async () => {
  for (const path of ENDPOINTS) {
    const { status } = await vgFetch(path)
    assert.equal(status, 401, path)
  }
})

test('reference lists return 200 arrays for a read-only caller', async () => {
  for (const path of ENDPOINTS) {
    const { status, json } = await vgFetch(path, { token: tokens.special.readOnly })
    assert.equal(status, 200, path)
    assert.ok(Array.isArray(json), `${path} returns an array`)
  }
})

test('capabilities serves the static reference rows', async () => {
  const { json } = await vgFetch('/capabilities', { token: tokens.users.full_v1 })
  assert.deepEqual(json.map(c => c.name).sort(),
    ['Errands', 'Friends', 'Home Help', 'Rides', 'Tech Support'])
  assert.ok(json.every(c => c.capabilityId && c.name), 'items carry {capabilityId, name}')
})
