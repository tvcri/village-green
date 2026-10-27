import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'
import { withDb } from '../../lib/db.js'
import { villages } from '../../setup/fixtures.js'

// person.deceased is the flag; deceasedDate is optional and only valid while
// the flag is set (DB CHECK chk_person_deceased_date; the service answers 422
// before the CHECK can surface as a 500). Throwaway persons live in the
// scratch village.
const scratch = String(villages.scratch.id)
const staff = tokens.users.staff
const DATE_MSG = 'A deceased date requires deceased to be true.'

async function makePerson (lastName, body = {}) {
  const res = await vgCall('createPerson', {}, {
    token: staff, body: { villageId: scratch, firstName: 'Throwaway', lastName, ...body },
  })
  assert.equal(res.status, 201, 'precondition: person created')
  return res
}
const patch = (personId, body) => vgCall('patchPerson', { personId }, { token: staff, body })

test('new person defaults to not deceased', async () => {
  const { json } = await makePerson('DecDefault')
  assert.equal(json.deceased, false)
})

test('deceased with unknown date', async () => {
  const { json: p } = await makePerson('DecUnknown')
  const res = await patch(p.personId, { deceased: true })
  assert.equal(res.status, 200)
  assert.equal(res.json.deceased, true)
  assert.equal(res.json.deceasedDate, null)
})

test('deceased with a date', async () => {
  const { json: p } = await makePerson('DecDated')
  const res = await patch(p.personId, { deceased: true, deceasedDate: '2026-09-01' })
  assert.equal(res.status, 200)
  assert.equal(res.json.deceased, true)
  assert.equal(res.json.deceasedDate, '2026-09-01')
})

test('date without the flag is 422', async () => {
  const { json: p } = await makePerson('DecNoFlag')
  const res = await patch(p.personId, { deceasedDate: '2026-09-01' })
  assert.equal(res.status, 422)
  assert.equal(res.json.detail, DATE_MSG)
  const post = await vgCall('createPerson', {}, {
    token: staff, body: { villageId: scratch, firstName: 'Throwaway', lastName: 'DecPost', deceasedDate: '2026-09-01' },
  })
  assert.equal(post.status, 422, 'createPerson applies the same rule')
})

test('untick without clearing date is 422', async () => {
  const { json: p } = await makePerson('DecUntick')
  assert.equal((await patch(p.personId, { deceased: true, deceasedDate: '2026-09-01' })).status, 200)
  assert.equal((await patch(p.personId, { deceased: false })).status, 422)
  const ok = await patch(p.personId, { deceased: false, deceasedDate: null })
  assert.equal(ok.status, 200)
  assert.equal(ok.json.deceased, false)
  assert.equal(ok.json.deceasedDate, null)
})

test('deceased person leaves the active views but keeps role status', async () => {
  const { json: p } = await makePerson('DecActive')
  const put = await vgCall('putPersonMember', { personId: p.personId }, {
    token: staff, body: { status: 'Active', memberLevel: 'Household', joinDate: '2026-01-15' },
  })
  assert.equal(put.status, 200)
  const ids = async () => (await vgCall('getVillageMembers', { villageId: scratch }, { token: staff })).json.map(m => m.personId)
  assert.ok((await ids()).includes(p.personId), 'precondition: listed while alive')
  assert.equal((await patch(p.personId, { deceased: true })).status, 200)
  assert.ok(!(await ids()).includes(p.personId), 'deceased person is omitted')
  const [rows] = await withDb(c => c.query('SELECT status FROM member WHERE personId = ?', [Number(p.personId)]))
  assert.equal(rows[0].status, 'Active')
})

test('open request count', async () => {
  const { json: p } = await makePerson('DecOpenSr')
  const before = await vgCall('getPerson', { personId: p.personId }, { token: staff })
  assert.equal(before.json.openServiceRequestCount, 0)
  const created = await vgCall('createServiceRequest', {}, {
    token: tokens.users.sc,
    body: { villageId: scratch, memberPersonId: p.personId, serviceDate: '2026-12-01' },
  })
  assert.equal(created.status, 201)
  const after = await vgCall('getPerson', { personId: p.personId }, { token: staff })
  assert.equal(after.json.openServiceRequestCount, 1)
})

test('getPersons summary rows carry deceased', async () => {
  const { json: p } = await makePerson('DecSummary')
  assert.equal((await patch(p.personId, { deceased: true })).status, 200)
  const { status, json } = await vgCall('getPersons', { lastName: 'DecSummary' }, { token: staff })
  assert.equal(status, 200)
  const row = json.find(r => r.personId === p.personId)
  assert.ok(row, 'summary row found')
  assert.strictEqual(row.deceased, true)
  assert.ok(json.every(r => typeof r.deceased === 'boolean'), 'every summary row has a boolean deceased')
})
