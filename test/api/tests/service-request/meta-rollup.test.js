import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'
import { villages, serviceRequests as sr } from '../../setup/fixtures.js'

// HEADLINE: the meta roll-up guarantee, post-#56. A multi-grant user must NAME
// its villages: `GET /service-requests?villageId=…` with the filter ⊆ grants
// unions exactly those villages; ANY ungranted id in the filter -> 403 (the
// old "cannot expand scope -> empty" contract is gone); no filter at all ->
// 403 (a federation-wide query needs a federation read). Finding #3 (the
// multi-value IN mis-bind) was fixed by #56 — the union case is GREEN via
// vgCall now.

const idsOf = (rows) => rows.map(r => r.serviceRequestId)

test('multi-grant roll-up: villageId=[both granted] = union, excludes others', async () => {
  const { status, json } = await vgCall('getServiceRequests',
    { villageId: [String(villages.quahog.id), String(villages.innsmouth.id)] },
    { token: tokens.users.multi })
  assert.equal(status, 200)
  const ids = idsOf(json)
  assert.ok(ids.includes(String(sr.srV1.id)), 'should include Quahog request')
  assert.ok(ids.includes(String(sr.srV2.id)), 'should include Innsmouth request')
  assert.ok(!ids.includes(String(sr.srV3.id)), 'must NOT include ungranted Miskatonic request')

  const villageIds = new Set(json.map(r => r.villageId))
  assert.ok(!villageIds.has(String(villages.miskatonic.id)), 'Miskatonic must never appear')
})

test('multi-grant user without a villageId filter -> 403 (federation-wide query)', async () => {
  const { status } = await vgCall('getServiceRequests', {}, { token: tokens.users.multi })
  assert.equal(status, 403)
})

test('client villageId narrows within grants (single granted village)', async () => {
  const { status, json } = await vgCall('getServiceRequests',
    { villageId: [String(villages.quahog.id)] },
    { token: tokens.users.multi })
  assert.equal(status, 200)
  assert.ok(json.every(r => r.villageId === String(villages.quahog.id)), 'only Quahog rows')
  assert.ok(idsOf(json).includes(String(sr.srV1.id)))
})

test('filter mixing granted + UNgranted villages -> 403 (any ungranted id denies)', async () => {
  const { status } = await vgCall('getServiceRequests',
    { villageId: [String(villages.quahog.id), String(villages.miskatonic.id)] },
    { token: tokens.users.multi })
  assert.equal(status, 403)
})

test('filter of only an ungranted village -> 403', async () => {
  const { status } = await vgCall('getServiceRequests',
    { villageId: [String(villages.miskatonic.id)] },
    { token: tokens.users.multi })
  assert.equal(status, 403)
})

test('single-grant user cannot reach another village via villageId -> 403', async () => {
  const { status } = await vgCall('getServiceRequests',
    { villageId: [String(villages.innsmouth.id)] },
    { token: tokens.users.full_v1 })
  assert.equal(status, 403)
})
