import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'

// Reference-data smokes: the read-only lookup lists behind the person and
// volunteer forms. All are gated by vg:person:read (the readOnly token
// suffices). capability, circle, gender, ethnicity, race, contact_method and
// language ship static rows; disability and vetting_type start empty in the
// scaffolded test schema, so their smokes assert shape, not content.
// Addressed by operationId (vgCall) — a path rename on main follows the spec.
const OPS = ['getCircles', 'getDisabilities', 'getCapabilities', 'getVettingTypes',
  'getGenders', 'getEthnicities', 'getRaces', 'getContactMethods', 'getLanguages']

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
  // The 5 service capabilities from the static seed. Steering Committee left
  // the list in migration 0028 (it is a village position now).
  // Superset-tolerant so future additive migrations don't break the smoke.
  const { json } = await vgCall('getCapabilities', {}, { token: tokens.users.full_v1 })
  const names = json.map(c => c.name)
  for (const expected of ['Errands', 'Friends', 'Home Help', 'Rides', 'Tech Support']) {
    assert.ok(names.includes(expected), `capabilities include ${expected}`)
  }
  assert.ok(!names.includes('Steering Committee'), 'Steering Committee is a position now, not a capability')
  assert.ok(json.every(c => c.capabilityId && c.name), 'items carry {capabilityId, name}')
})

test('circles serves the four seeded circles by public name', async () => {
  const { json } = await vgCall('getCircles', {}, { token: tokens.users.full_v1 })
  assert.deepEqual(json.map(c => c.name).sort(), ['Circle of Pride', 'DownCity', 'OakHill', "Veteran's Circle"])
  assert.ok(json.every(c => c.circleId && c.name), 'items carry {circleId, name}')
})

test('lookups serve the settled vocabularies in the settled order', async () => {
  const t = tokens.users.full_v1
  assert.deepEqual((await vgCall('getGenders', {}, { token: t })).json.map(x => x.name), ['Female', 'Male', 'Other'])
  assert.deepEqual((await vgCall('getEthnicities', {}, { token: t })).json.map(x => x.name), ['Hispanic or Latino', 'Not Hispanic or Latino'])
  assert.deepEqual((await vgCall('getRaces', {}, { token: t })).json.map(x => x.name), [
    'American Indian or Alaska Native', 'Asian', 'Black or African American',
    'Native Hawaiian or Other Pacific Islander', 'White',
  ])
  assert.deepEqual((await vgCall('getContactMethods', {}, { token: t })).json.map(x => x.name), ['Phone', 'Cell', 'Email', 'Mail'])
  const langs = (await vgCall('getLanguages', {}, { token: t })).json
  assert.deepEqual(langs.map(x => `${x.name}/${x.tag}`), ['English/en', 'Italian/it', 'Portuguese/pt', 'Spanish/es'])
})
