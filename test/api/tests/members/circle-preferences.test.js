import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'
import { persons } from '../../setup/fixtures.js'

// member_circle_preference: "when requesting services, prefer a responder
// from this circle". Replaced as a set when circlePreferences is present;
// always read back on the member projection (the SR workflow's lookup).
const pid = persons.quahogMember.id

async function circleIds () {
  const r = await vgCall('getCircles', {}, { token: tokens.users.staff })
  return Object.fromEntries(r.json.map(c => [c.name, c.circleId]))
}

after(async () => {
  await vgCall('patchPersonMember', { personId: pid }, { token: tokens.users.staff, body: { circlePreferences: [] } })
})

test('member projection always carries circlePreferences, empty by default', async () => {
  const r = await vgCall('getPerson', { personId: pid, projection: ['member'] }, { token: tokens.users.staff })
  assert.equal(r.status, 200)
  assert.deepEqual(r.json.member.circlePreferences, [])
})

test('patch sets, reads back with names, and [] clears', async () => {
  const c = await circleIds()
  const set = await vgCall('patchPersonMember', { personId: pid }, {
    token: tokens.users.staff, body: { circlePreferences: [c["Veteran's Circle"], c['Circle of Pride']] },
  })
  assert.equal(set.status, 200)
  assert.deepEqual(set.json.member.circlePreferences.map(x => x.name), ['Circle of Pride', "Veteran's Circle"])

  const other = await vgCall('patchPersonMember', { personId: pid }, { token: tokens.users.staff, body: { serviceNotes: 'x' } })
  assert.equal(other.json.member.circlePreferences.length, 2, 'a patch without the key leaves the set alone')

  const clear = await vgCall('patchPersonMember', { personId: pid }, { token: tokens.users.staff, body: { circlePreferences: [] } })
  assert.deepEqual(clear.json.member.circlePreferences, [])
})

test('unknown circleId is rejected by the FK, not silently ignored', async () => {
  const r = await vgCall('patchPersonMember', { personId: pid }, { token: tokens.users.staff, body: { circlePreferences: ['999999'] } })
  assert.ok(r.status >= 400, `expected an error status, got ${r.status}`)
})
