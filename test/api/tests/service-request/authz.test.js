import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'
import { villages, serviceRequests as sr, persons } from '../../setup/fixtures.js'

// Post-#56 contract: sr:read/sr:write are DB grants. A village-scope user must
// name villages (villageId ⊆ granted) to list; no filter = federation-wide
// query -> 403. Cross-village by-id and writes are enforced 403s now (the old
// RED findings #1/#2 are fixed by #56), so everything goes through vgCall.
const idsOf = (rows) => rows.map(r => r.serviceRequestId)

// ---- list endpoint: village users must scope with villageId ----

test('full_v1 list scoped to Quahog shows only Quahog requests', async () => {
  const { status, json } = await vgCall('getServiceRequests',
    { villageId: [String(villages.quahog.id)] },
    { token: tokens.users.full_v1 })
  assert.equal(status, 200)
  const ids = idsOf(json)
  assert.ok(ids.includes(String(sr.srV1.id)))
  assert.ok(!ids.includes(String(sr.srV2.id)), 'must not leak Innsmouth')
  assert.ok(!ids.includes(String(sr.srV3.id)), 'must not leak Miskatonic')
})

test('full_v2 list scoped to Innsmouth shows only Innsmouth requests', async () => {
  const { status, json } = await vgCall('getServiceRequests',
    { villageId: [String(villages.innsmouth.id)] },
    { token: tokens.users.full_v2 })
  assert.equal(status, 200)
  const ids = idsOf(json)
  assert.ok(ids.includes(String(sr.srV2.id)))
  assert.ok(!ids.includes(String(sr.srV1.id)))
})

test('village user without a villageId filter -> 403 (no filter = federation-wide query)', async () => {
  const { status } = await vgCall('getServiceRequests', {}, { token: tokens.users.full_v1 })
  assert.equal(status, 403)
})

test('admin sees every village on a plain call (federation wildcard, no elevate)', async () => {
  const { status, json } = await vgCall('getServiceRequests', {}, { token: tokens.users.admin })
  assert.equal(status, 200)
  const ids = idsOf(json)
  assert.ok(ids.includes(String(sr.srV1.id)))
  assert.ok(ids.includes(String(sr.srV2.id)))
  assert.ok(ids.includes(String(sr.srV3.id)))
})

test('nogrants user -> 403, filtered or not', async () => {
  const plain = await vgCall('getServiceRequests', {}, { token: tokens.users.nogrants })
  assert.equal(plain.status, 403)
  const filtered = await vgCall('getServiceRequests',
    { villageId: [String(villages.quahog.id)] },
    { token: tokens.users.nogrants })
  assert.equal(filtered.status, 403)
})

// ---- by-id within own grant: works (GREEN sanity) ----

test('full_v1 can read its own village request by id', async () => {
  const { status, json } = await vgCall('getServiceRequest', { serviceRequestId: sr.srV1.id }, { token: tokens.users.full_v1 })
  assert.equal(status, 200)
  assert.equal(json.villageId, String(villages.quahog.id))
})

// ---- by-id across villages: denied with 403 (fixed by #56, was finding #1) ----
// The record is fetched first, then perm-checked, so an existing ungranted
// record is 403 (not 404); a nonexistent id stays 404.

test('full_v1 cannot read an Innsmouth request by id', async () => {
  const { status } = await vgCall('getServiceRequest', { serviceRequestId: sr.srV2.id }, { token: tokens.users.full_v1 })
  assert.equal(status, 403)
})

test('full_v1 cannot pull an Innsmouth member address via projection', async () => {
  const { status, json } = await vgCall('getServiceRequest',
    { serviceRequestId: sr.srV2.id, projection: ['memberAddress'] },
    { token: tokens.users.full_v1 })
  assert.equal(status, 403)
  // Defense in depth: even if the request is (wrongly) served, no address must leak.
  if (json && json.memberAddress) {
    assert.fail(`leaked Innsmouth member address: ${JSON.stringify(json.memberAddress)}`)
  }
})

// ---- nested route: per-village perm checked BEFORE existence -> 403 ----

test('full_v1 gets 403 for an ungranted village nested route', async () => {
  const { status } = await vgCall('getVillageServiceRequests', { villageId: villages.innsmouth.id }, {
    token: tokens.users.full_v1,
  })
  assert.equal(status, 403)
})

// ---- writes: village-scope roles are READ-ONLY post-#56 ----
// sr:write lives only at federation scope (sc/staff/admin); village users are
// denied even in their own granted village.

test('full_v1 cannot create a request in Innsmouth', async () => {
  const res = await vgCall('createServiceRequest', {}, {
    token: tokens.users.full_v1,
    body: {
      // status is server-derived (POST only accepts 'Draft'); omit it so the body
      // is schema-valid and the request actually exercises the authz path.
      villageId: String(villages.innsmouth.id),
      memberPersonId: String(persons.innsmouthMember.id),
      serviceName: 'cross-village create attempt',
    },
  })
  // Undo a regression (write slipping through) so no stray Innsmouth request
  // leaks into the files that run after this one.
  if (res.status === 201 && res.json?.serviceRequestId) {
    await vgCall('deleteServiceRequest', { serviceRequestId: res.json.serviceRequestId }, {
      token: tokens.users.sc,
    })
  }
  assert.equal(res.status, 403)
})

test('full_v1 cannot create a request even in its OWN granted village', async () => {
  const res = await vgCall('createServiceRequest', {}, {
    token: tokens.users.full_v1,
    body: {
      villageId: String(villages.quahog.id),
      memberPersonId: String(persons.quahogMember.id),
      serviceName: 'read-only role create attempt',
    },
  })
  if (res.status === 201 && res.json?.serviceRequestId) {
    await vgCall('deleteServiceRequest', { serviceRequestId: res.json.serviceRequestId }, {
      token: tokens.users.sc,
    })
  }
  assert.equal(res.status, 403)
})

test('full_v1 cannot patch an Innsmouth request', async () => {
  const { status } = await vgCall('patchServiceRequest', { serviceRequestId: sr.srV2.id }, {
    token: tokens.users.full_v1,
    body: { serviceName: 'cross-village tamper attempt' },
  })
  // Undo a regression: restore the canonical fixture value via sc (sr:write).
  if (status === 200) {
    await vgCall('patchServiceRequest', { serviceRequestId: sr.srV2.id }, {
      token: tokens.users.sc,
      body: { serviceName: sr.srV2.serviceName },
    })
  }
  assert.equal(status, 403)
})
