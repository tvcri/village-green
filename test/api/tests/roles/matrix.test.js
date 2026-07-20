import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'
import { villages, serviceRequests as sr, persons } from '../../setup/fixtures.js'

// Post-#56 role matrix. Roles are DB permission bundles (role_grant ->
// role_permission), not token claims:
//   village scope (grant carries a villageId; reach confined to it — all READ-ONLY):
//     1 Local Service Coordinator, 2 Steering Committee — IDENTICAL bundles
//       (person/member/volunteer/sr/friend/village :read)
//     3 Village Lead — same reads + member:read_financial
//   federation scope (villageId null; reach every village):
//     5 Staff — all reads + writes (+ confidential/financial/inactive extras)
//     6 Board — the six :reads only; sees everything, writes nothing
//     7 Service Coordinator — reads + person:read_confidential; sr:write is its ONLY write
// Writes are federation-only: no village role can write anything.

const quahog = String(villages.quahog.id)
const innsmouth = String(villages.innsmouth.id)
// key -> label; owner_v1 = role 3, full_v1 = role 2, restricted_v1 = role 1 (all Quahog)
const villageRoleUsers = {
  owner_v1: 'role 3 Village Lead',
  full_v1: 'role 2 Steering Committee',
  restricted_v1: 'role 1 Local Service Coordinator',
}

test('roles 1 and 2 are identical read bundles (same SR + person view of Quahog)', async () => {
  const r = await vgCall('getServiceRequests', { villageId: [quahog] }, { token: tokens.users.restricted_v1 })
  const f = await vgCall('getServiceRequests', { villageId: [quahog] }, { token: tokens.users.full_v1 })
  assert.equal(r.status, 200)
  assert.equal(f.status, 200)
  assert.deepEqual(
    r.json.map(x => x.serviceRequestId).sort(),
    f.json.map(x => x.serviceRequestId).sort(),
    'role 1 and role 2 see the identical Quahog request set')

  const rp = await vgCall('getPersons', { villageId: [quahog] }, { token: tokens.users.restricted_v1 })
  const fp = await vgCall('getPersons', { villageId: [quahog] }, { token: tokens.users.full_v1 })
  assert.equal(rp.status, 200)
  assert.deepEqual(
    rp.json.map(p => p.fullName).sort(),
    fp.json.map(p => p.fullName).sort(),
    'role 1 and role 2 see the identical Quahog roster')
  assert.ok(rp.json.map(p => p.fullName).includes(persons.quahogMember.fullName))
})

test('every village role is confined to its granted village', async () => {
  for (const [key, label] of Object.entries(villageRoleUsers)) {
    const token = tokens.users[key]
    const own = await vgCall('getVillage', { villageId: quahog }, { token })
    assert.equal(own.status, 200, `${label}: own village readable`)
    // per-village perm is checked BEFORE existence: ungranted -> 403, not 404
    const cross = await vgCall('getVillage', { villageId: innsmouth }, { token })
    assert.equal(cross.status, 403, `${label}: ungranted village denied`)
    // no villageId filter = federation-wide query -> denied for village users
    const unfiltered = await vgCall('getServiceRequests', {}, { token })
    assert.equal(unfiltered.status, 403, `${label}: unfiltered list requires a federation read`)
    // any ungranted villageId in the filter -> 403, not an empty result
    const crossFilter = await vgCall('getPersons', { villageId: [innsmouth] }, { token })
    assert.equal(crossFilter.status, 403, `${label}: ungranted villageId filter denied`)
  }
})

test('no village role can write: SR create denied even for Village Lead (fixed by #56)', async () => {
  // Formerly a todo ("role tiers are not enforced") — village roles are now
  // read-only bundles, so the write denial is a green assertion.
  for (const [key, label] of Object.entries(villageRoleUsers)) {
    const res = await vgCall('createServiceRequest', {}, {
      token: tokens.users[key],
      body: {
        villageId: quahog,
        memberPersonId: String(persons.quahogMember.id),
        serviceName: `${key} write attempt`,
      },
    })
    if (res.status === 201 && res.json?.serviceRequestId) {
      // wrongly-authorized write: remove the row so later files see canonical data
      await vgCall('deleteServiceRequest', { serviceRequestId: res.json.serviceRequestId }, { token: tokens.users.staff })
    }
    assert.equal(res.status, 403, `${label} must be read-only`)
  }
})

test('federation readers (staff/board/sc) see every village without a filter', async () => {
  for (const key of ['staff', 'board', 'sc']) {
    const token = tokens.users[key]
    const list = await vgCall('getServiceRequests', {}, { token })
    assert.equal(list.status, 200, `${key}: federation-wide list allowed`)
    const ids = list.json.map(r => r.serviceRequestId)
    for (const s of [sr.srV1, sr.srV2, sr.srV3]) {
      assert.ok(ids.includes(String(s.id)), `${key} sees request ${s.id} (all villages)`)
    }
    const cross = await vgCall('getVillage', { villageId: innsmouth }, { token })
    assert.equal(cross.status, 200, `${key}: any village readable by id`)
  }
})

test('sr:write is federation-only: sc and staff can create, board cannot', async () => {
  const body = {
    villageId: quahog,
    memberPersonId: String(persons.quahogMember.id),
    serviceName: 'matrix sr:write probe',
  }
  const denied = await vgCall('createServiceRequest', {}, { token: tokens.users.board, body })
  assert.equal(denied.status, 403, 'board reads everything, writes nothing')

  for (const key of ['sc', 'staff']) {
    const created = await vgCall('createServiceRequest', {}, {
      token: tokens.users[key], body: { ...body, serviceName: `matrix ${key} write` },
    })
    assert.equal(created.status, 201, `${key} holds sr:write`)
    const del = await vgCall('deleteServiceRequest',
      { serviceRequestId: created.json.serviceRequestId }, { token: tokens.users[key] })
    assert.equal(del.status, 200, `${key} cleans up its own request`)
  }
})

test('member:read_financial: role 3 and staff see dues fields; roles 1/2, board, sc do not', async () => {
  // Observable via getPerson?projection=member — financial keys
  // (householdDues, quickbooksKey) are projected only with the permission.
  const expectations = [
    ['owner_v1', true],
    ['full_v1', false],
    ['restricted_v1', false],
    ['staff', true],
    ['board', false],
    ['sc', false],
  ]
  for (const [key, canSeeFinancial] of expectations) {
    const { status, json } = await vgCall('getPerson',
      { personId: String(persons.quahogMember.id), projection: ['member'] },
      { token: tokens.users[key] })
    assert.equal(status, 200, `${key}: member projection readable`)
    assert.ok(json.member, `${key}: member block present`)
    assert.equal('householdDues' in json.member, canSeeFinancial,
      `${key}: householdDues ${canSeeFinancial ? 'projected' : 'withheld'}`)
    assert.equal('quickbooksKey' in json.member, canSeeFinancial,
      `${key}: quickbooksKey ${canSeeFinancial ? 'projected' : 'withheld'}`)
  }
})
