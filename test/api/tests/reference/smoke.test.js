import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'

// Reference-data smokes: the read-only lookup lists behind the person and
// volunteer forms. All four are gated by vg:person:read (the readOnly token
// suffices). Only `capability` ships static rows; the other tables start empty
// in the scaffolded test schema, so their smokes assert shape, not content.
// Addressed by operationId (vgCall) — a path rename on main follows the spec.
const OPS = ['getCommunities', 'getDisabilities', 'getCapabilities', 'getVettingTypes']

test('reference lists require authentication', async () => {
  for (const op of OPS) {
    const { status } = await vgCall(op)
    assert.equal(status, 401, op)
  }
})

test('reference lists return 200 arrays for a read-only caller', async () => {
  for (const op of OPS) {
    const { status, json } = await vgCall(op, {}, { token: tokens.special.readOnly })
    assert.equal(status, 200, op)
    assert.ok(Array.isArray(json), `${op} returns an array`)
  }
})

test('capabilities serves the known reference rows', async () => {
  // 5 from the static seed + 'Steering Committee' added by migration 0012.
  // Superset-tolerant so future additive migrations don't break the smoke.
  const { json } = await vgCall('getCapabilities', {}, { token: tokens.users.full_v1 })
  const names = json.map(c => c.name)
  for (const expected of ['Errands', 'Friends', 'Home Help', 'Rides', 'Tech Support', 'Steering Committee']) {
    assert.ok(names.includes(expected), `capabilities include ${expected}`)
  }
  assert.ok(json.every(c => c.capabilityId && c.name), 'items carry {capabilityId, name}')
})
