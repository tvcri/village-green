import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'
import { villages } from '../../setup/fixtures.js'

// member/volunteer.application: the wizard's extraction envelope. Written by
// anyone with the role's write key; read only via ?projection=application,
// and each key only with member:/volunteer:read_application (Staff + Admin).
// The extraction crosses the financial, birth-date and demographics gates,
// so a Village Lead (read_financial, no read_application) must see nothing.
const scratch = String(villages.scratch.id)
const staff = { token: tokens.users.staff }
let mid, vid
const envelope = (type, memberIndex) => ({
  applicationType: type, schemaVersion: 1, extractedAt: '2026-09-22T14:00:00.000Z', memberIndex,
  extraction: { applicationType: type, preferences: { circleOfPrideJoin: 'Yes' }, members: [{ extras: { veteran: 'No' } }] },
})
const readApp = (personId, token = tokens.users.staff) =>
  vgCall('getPerson', { personId, projection: ['application'] }, { token })

before(async () => {
  const m = await vgCall('createPerson', {}, { ...staff, body: { villageId: scratch, firstName: 'App', lastName: 'Member' } })
  mid = m.json.personId
  await vgCall('putPersonMember', { personId: mid }, { ...staff, body: { memberLevel: 'Household', joinDate: '2026-01-15' } })
  const v = await vgCall('createPerson', {}, { ...staff, body: { villageId: scratch, firstName: 'App', lastName: 'Volunteer' } })
  vid = v.json.personId
  await vgCall('putPersonVolunteer', { personId: vid }, { ...staff, body: { active: true } })
})

after(async () => {
  for (const personId of [mid, vid]) await vgCall('deletePerson', { personId }, staff)
})

test('staff writes a member envelope and reads it back via the projection', async () => {
  const w = await vgCall('patchPersonMember', { personId: mid }, { ...staff, body: { application: envelope('member', 0) } })
  assert.equal(w.status, 200)
  assert.ok(!('application' in w.json), 'write responses never carry the application')
  assert.ok(!('application' in (w.json.member ?? {})), 'nor does the member projection')
  const r = await readApp(mid)
  assert.equal(r.status, 200)
  assert.deepEqual(r.json.application.member, envelope('member', 0))
  assert.equal(r.json.application.volunteer, null, 'no volunteer role -> null, key present for staff')
})

test('a member PUT without application leaves the stored envelope alone', async () => {
  await vgCall('patchPersonMember', { personId: mid }, { ...staff, body: { application: envelope('member', 1) } })
  const put = await vgCall('putPersonMember', { personId: mid }, { ...staff, body: { memberLevel: 'Individual', joinDate: '2026-01-15' } })
  assert.equal(put.status, 200)
  assert.deepEqual((await readApp(mid)).json.application.member, envelope('member', 1))
})

test('volunteer envelope: PUT without the key keeps it, explicit null clears it', async () => {
  const w = await vgCall('patchPersonVolunteer', { personId: vid }, { ...staff, body: { application: envelope('volunteer', null) } })
  assert.equal(w.status, 200)
  await vgCall('putPersonVolunteer', { personId: vid }, { ...staff, body: { active: true } })
  assert.deepEqual((await readApp(vid)).json.application.volunteer, envelope('volunteer', null))
  await vgCall('patchPersonVolunteer', { personId: vid }, { ...staff, body: { application: null } })
  assert.equal((await readApp(vid)).json.application.volunteer, null)
})

test('Village Lead (read_financial, no read_application), board and SC see no envelope keys', async () => {
  // owner_v1 (Village Lead) is granted in quahog, like birthdate.test.js and
  // demographics.test.js, so this case reads a quahog person.
  const { persons } = await import('../../setup/fixtures.js')
  const q = persons.quahogMember.id
  await vgCall('patchPersonMember', { personId: q }, { ...staff, body: { application: envelope('member', 0) } })
  try {
    for (const who of ['owner_v1', 'board', 'sc']) {
      const r = await readApp(q, tokens.users[who])
      assert.equal(r.status, 200, who)
      assert.ok(!('member' in r.json.application), `${who} must not see application.member`)
      assert.ok(!('volunteer' in r.json.application), `${who} must not see application.volunteer`)
    }
  } finally {
    await vgCall('patchPersonMember', { personId: q }, { ...staff, body: { application: null } })
  }
})

test('an envelope missing schemaVersion is rejected', async () => {
  const { schemaVersion, ...bad } = envelope('member', 0)
  const r = await vgCall('patchPersonMember', { personId: mid }, { ...staff, body: { application: bad } })
  assert.equal(r.status, 400)
})
