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
//     7 Service Coordinator — reads + member:read_sc_note; sr:write is its ONLY write
//     8 Sync Service — person read/write, member/volunteer read, donor read/write,
//       sync read/write; the vg-sync service account, no UI user
// Writes are federation-only: no village role can write anything.

// serviceDateStart is required; this window spans all SR fixtures (2026-07-10..12).
const ALL_DATES = { serviceDateStart: '2000-01-01' }

const quahog = String(villages.quahog.id)
const innsmouth = String(villages.innsmouth.id)
// key -> label; owner_v1 = role 3, full_v1 = role 2, restricted_v1 = role 1 (all Quahog)
const villageRoleUsers = {
  owner_v1: 'role 3 Village Lead',
  full_v1: 'role 2 Steering Committee',
  restricted_v1: 'role 1 Local Service Coordinator',
}

test('roles 1 and 2 are identical read bundles (same SR + person view of Quahog)', async () => {
  const r = await vgCall('getServiceRequests', { villageId: [quahog], ...ALL_DATES }, { token: tokens.users.restricted_v1 })
  const f = await vgCall('getServiceRequests', { villageId: [quahog], ...ALL_DATES }, { token: tokens.users.full_v1 })
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
    // no villageId filter = federation-wide query -> denied for village users.
    // Dates are supplied so the request clears OAS validation and actually
    // reaches the controller's privilege check (a bare call now 400s first).
    const unfiltered = await vgCall('getServiceRequests', { ...ALL_DATES }, { token })
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
        serviceDate: '2026-07-11',
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
    const list = await vgCall('getServiceRequests', { ...ALL_DATES }, { token })
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
    serviceDate: '2026-07-11',
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

// ---- role 8, Sync Service ----
// The vg-sync service account must see every person (matching must not miss
// anyone) and write persons and donors, and nothing beyond that.
const syncToken = tokens.users.sync
const uniqName = (s) => `${s}${Date.now()}${Math.round(Math.random() * 1e6)}`

async function donorOnlyPerson () {
  const lastName = uniqName('SyncRole')
  const created = await vgCall('createPerson', {}, { token: tokens.users.staff, body: { villageId: null, firstName: 'Dana', lastName } })
  assert.equal(created.status, 201)
  const personId = created.json.personId
  const put = await vgCall('putPersonDonor', { personId }, { token: tokens.users.admin, body: { lglConstituentId: '700001' } })
  assert.equal(put.status, 200)
  return { personId, lastName }
}

test('role 8 reads every person, donor data included', async () => {
  const { personId, lastName } = await donorOnlyPerson()
  const res = await vgCall('getPersons', { lastName, projection: ['detail'] }, { token: syncToken })
  assert.equal(res.status, 200)
  const row = res.json.find(p => p.personId === personId)
  assert.ok(row, 'donor-only person is visible to role 8')
  assert.equal(row.donor?.lglConstituentId, '700001')
  // member- and volunteer-only fixture persons are visible too
  const all = await vgCall('getPersons', {}, { token: syncToken })
  assert.equal(all.status, 200)
  const ids = new Set(all.json.map(p => p.personId))
  assert.ok(ids.has(String(persons.quahogMember.id)), 'member person visible')
  assert.ok(ids.has(String(persons.innsmouthVolunteer.id)), 'volunteer person visible')
})

test('role 8 writes persons and donors', async () => {
  const { personId } = await donorOnlyPerson()
  const patch = await vgCall('patchPerson', { personId }, { token: syncToken, body: { firstName: 'Dina' } })
  assert.equal(patch.status, 200)
  const put = await vgCall('putPersonDonor', { personId }, { token: syncToken, body: { lglConstituentId: '700002', lastGiftDate: '2025-06-30' } })
  assert.equal(put.status, 200)
  assert.equal(put.json.donor.lglConstituentId, '700002')
})

test('role 8 cannot write members, service requests or users', async () => {
  const member = await vgCall('patchPersonMember', { personId: String(persons.quahogMember.id) }, { token: syncToken, body: { memberLevel: 'Full' } })
  assert.equal(member.status, 403)
  const sr = await vgCall('createServiceRequest', {}, { token: syncToken, body: {
    villageId: String(villages.quahog.id), memberPersonId: String(persons.quahogMember.id),
    serviceName: 'Disposable ride', serviceDate: '2026-07-11',
  } })
  assert.equal(sr.status, 403)
  const user = await vgCall('createUser', {}, { token: syncToken, body: { username: uniqName('nobody'), roleGrants: [] } })
  assert.equal(user.status, 403)
})
