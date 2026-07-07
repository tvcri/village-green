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

test('capabilities serves the known reference rows', async () => {
  // 5 from the static seed + 'Steering Committee' added by migration 0012.
  // Superset-tolerant so future additive migrations don't break the smoke.
  const { json } = await vgFetch('/capabilities', { token: tokens.users.full_v1 })
  const names = json.map(c => c.name)
  for (const expected of ['Errands', 'Friends', 'Home Help', 'Rides', 'Tech Support', 'Steering Committee']) {
    assert.ok(names.includes(expected), `capabilities include ${expected}`)
  }
  assert.ok(json.every(c => c.capabilityId && c.name), 'items carry {capabilityId, name}')
})
