import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgFetch } from '../lib/client.js'
import { tokens } from '../lib/context.js'
import { villages, serviceRequests as sr, persons } from '../setup/fixtures.js'

const SR = '/service-requests'
const idsOf = (rows) => rows.map(r => r.serviceRequestId)

// ---- list endpoint: grant-filtered (GREEN) ----

test('full_v1 list shows only Quahog requests', async () => {
  const { status, json } = await vgFetch(SR, { token: tokens.users.full_v1 })
  assert.equal(status, 200)
  const ids = idsOf(json)
  assert.ok(ids.includes(String(sr.srV1.id)))
  assert.ok(!ids.includes(String(sr.srV2.id)), 'must not leak Innsmouth')
  assert.ok(!ids.includes(String(sr.srV3.id)), 'must not leak Miskatonic')
})

test('full_v2 list shows only Innsmouth requests', async () => {
  const { status, json } = await vgFetch(SR, { token: tokens.users.full_v2 })
  assert.equal(status, 200)
  const ids = idsOf(json)
  assert.ok(ids.includes(String(sr.srV2.id)))
  assert.ok(!ids.includes(String(sr.srV1.id)))
})

test('nogrants user sees nothing', async () => {
  const { status, json } = await vgFetch(SR, { token: tokens.users.nogrants })
  assert.equal(status, 200)
  assert.equal(json.length, 0)
})

// ---- by-id within own grant: works (GREEN sanity) ----

test('full_v1 can read its own village request by id', async () => {
  const { status, json } = await vgFetch(`/service-requests/${sr.srV1.id}`, { token: tokens.users.full_v1 })
  assert.equal(status, 200)
  assert.equal(json.villageId, String(villages.quahog.id))
})

// ---- by-id across villages: MUST be denied (RED — finding #1) ----

test('full_v1 cannot read an Innsmouth request by id', async () => {
  const { status } = await vgFetch(`/service-requests/${sr.srV2.id}`, { token: tokens.users.full_v1 })
  assert.equal(status, 404)
})

test('full_v1 cannot pull an Innsmouth member address via projection', async () => {
  const { status, json } = await vgFetch(`/service-requests/${sr.srV2.id}`, {
    token: tokens.users.full_v1,
    query: { projection: ['memberAddress'] },
  })
  assert.equal(status, 404)
  // Defense in depth: even if the request is (wrongly) served, no address must leak.
  if (json && json.memberAddress) {
    assert.fail(`leaked Innsmouth member address: ${JSON.stringify(json.memberAddress)}`)
  }
})

// ---- nested route: guarded (GREEN) ----

test('full_v1 gets 404 for an ungranted village nested route', async () => {
  const { status } = await vgFetch(`/villages/${villages.innsmouth.id}/service-requests`, {
    token: tokens.users.full_v1,
  })
  assert.equal(status, 404)
})

// ---- writes across villages: MUST be denied (RED — finding #2) ----

test('full_v1 cannot create a request in Innsmouth', async () => {
  const { status } = await vgFetch(SR, {
    token: tokens.users.full_v1,
    body: {
      // status is server-derived (POST only accepts 'Draft'); omit it so the body
      // is schema-valid and the request actually exercises the authz path.
      villageId: String(villages.innsmouth.id),
      memberPersonId: String(persons.innsmouthMember.id),
      serviceName: 'cross-village create attempt',
    },
  })
  assert.ok(status === 403 || status === 404, `expected denial, got ${status}`)
})

test('full_v1 cannot patch an Innsmouth request', async () => {
  const { status } = await vgFetch(`/service-requests/${sr.srV2.id}`, {
    token: tokens.users.full_v1,
    method: 'PATCH',
    body: { serviceName: 'cross-village tamper attempt' },
  })
  assert.ok(status === 403 || status === 404, `expected denial, got ${status}`)
})
