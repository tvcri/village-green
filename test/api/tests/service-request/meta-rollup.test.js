import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { vgFetch } from '../../lib/client.js'
import { tokens } from '../../lib/context.js'
import { villages, serviceRequests as sr } from '../../setup/fixtures.js'

// HEADLINE: the meta roll-up guarantee. Meta is a client concept; at the API
// boundary it is just `GET /service-requests` correctly unioning a multi-grant
// user's villages and excluding the rest — even when a villageId is supplied.
// These are GREEN positive-security assertions, except the documented multi-value
// filter bug (finding #3 in SECURITY-FINDINGS.md — literal vgFetch, pinned URL).

const idsOf = (rows) => rows.map(r => r.serviceRequestId)

test('multi-grant user roll-up = union of granted villages, excludes others', async () => {
  const { status, json } = await vgCall('getServiceRequests', {}, { token: tokens.users.multi })
  assert.equal(status, 200)
  const ids = idsOf(json)
  assert.ok(ids.includes(String(sr.srV1.id)), 'should include Quahog request')
  assert.ok(ids.includes(String(sr.srV2.id)), 'should include Innsmouth request')
  assert.ok(!ids.includes(String(sr.srV3.id)), 'must NOT include ungranted Miskatonic request')

  const villageIds = new Set(json.map(r => r.villageId))
  assert.ok(!villageIds.has(String(villages.miskatonic.id)), 'Miskatonic must never appear')
})

test('client villageId narrows within grants (single granted village)', async () => {
  const { status, json } = await vgCall('getServiceRequests',
    { villageId: [String(villages.quahog.id)] },
    { token: tokens.users.multi })
  assert.equal(status, 200)
  assert.ok(json.every(r => r.villageId === String(villages.quahog.id)), 'only Quahog rows')
  assert.ok(idsOf(json).includes(String(sr.srV1.id)))
})

test('client villageId for an UNgranted village cannot expand scope -> empty', async () => {
  const { status, json } = await vgCall('getServiceRequests',
    { villageId: [String(villages.miskatonic.id)] },
    { token: tokens.users.multi })
  assert.equal(status, 200)
  assert.equal(json.length, 0)
})

test('single-grant user cannot reach another village via villageId -> empty', async () => {
  const { status, json } = await vgCall('getServiceRequests',
    { villageId: [String(villages.innsmouth.id)] },
    { token: tokens.users.full_v1 })
  assert.equal(status, 200)
  assert.equal(json.length, 0)
})

// EXPECTED RED — finding #3: the `[villageId]` double-wrap mis-binds the IN list
// for multiple selected villages, so this multi-village filter returns wrong rows.
test('multi-value villageId returns both selected (granted) villages', async () => {
  const { status, json } = await vgFetch('/service-requests', {
    token: tokens.users.multi,
    query: { villageId: [String(villages.quahog.id), String(villages.innsmouth.id)] },
  })
  assert.equal(status, 200)
  const ids = idsOf(json)
  assert.ok(
    ids.includes(String(sr.srV1.id)) && ids.includes(String(sr.srV2.id)),
    'both Quahog and Innsmouth requests should be returned',
  )
})
