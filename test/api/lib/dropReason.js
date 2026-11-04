import assert from 'node:assert/strict'
import { vgCall } from './ops.js'
import { tokens } from './context.js'

// A fresh volunteer drop reason, for tests that must drop a volunteer
// (Dropped requires a reason since the volunteer drop-reason rules).
export async function makeVolunteerDropReason () {
  const res = await vgCall('createVolunteerDropReason', {}, {
    token: tokens.users.admin, body: { name: `Test reason ${Date.now()}-${Math.round(Math.random() * 1e6)}` },
  })
  assert.equal(res.status, 201)
  return res.json.volunteerDropReasonId
}
