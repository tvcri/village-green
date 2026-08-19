import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'
import { villages, persons } from '../../setup/fixtures.js'
import { auditRows } from './lib.js'

const SC_ID = 12
const VSS_JOE_ID = 13

// VSS mutates service_request directly; clean up anything the VSS test creates.
const vssCreatedIds = []
after(async () => {
  for (const serviceRequestId of vssCreatedIds) {
    await vgCall('deleteServiceRequest', { serviceRequestId }, { token: tokens.users.sc })
  }
})

async function createSr () {
  // Mirror the arrange body from tests/service-request/delete.test.js.
  const { status, json } = await vgCall('createServiceRequest', {}, {
    token: tokens.users.sc,
    body: {
      villageId: String(villages.quahog.id),
      memberPersonId: String(persons.quahogMember.id),
      serviceName: 'Disposable ride',
      serviceDate: '2026-07-11',
    },
  })
  assert.equal(status, 201)
  return json.serviceRequestId ?? json.id
}

test('SR create/patch/delete audit lifecycle', async () => {
  const srId = await createSr()

  let rows = await auditRows('serviceRequest', srId)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].action, 'create')
  assert.equal(rows[0].userId, SC_ID)
  assert.equal(typeof rows[0].changes.snapshot.status, 'string')
  assert.match(rows[0].changes.snapshot.serviceDate ?? '', /^\d{4}-\d{2}-\d{2}$/, 'civil date stays a plain date string')
  assert.match(rows[0].changes.snapshot.createdAt ?? '', /^\d{4}-\d{2}-\d{2}T.*Z$/, 'DATETIME stays a UTC instant (dateStrings must scope to DATE only)')

  // THE distinctive VG test: patch a non-status field on an Open SR.
  // patchServiceRequest writes status unconditionally (service line 428-431),
  // so a naive intent-based audit would log a phantom status change. The
  // differ must not.
  const patched = await vgCall('patchServiceRequest', { serviceRequestId: srId }, {
    token: tokens.users.sc, body: { description: 'audit probe' },
  })
  assert.equal(patched.status, 200)
  rows = await auditRows('serviceRequest', srId)
  assert.equal(rows.length, 2)
  assert.deepEqual(Object.keys(rows[1].changes.diff), ['description'], 'unconditional same-value status write produces no diff entry')

  const del = await vgCall('deleteServiceRequest', { serviceRequestId: srId }, { token: tokens.users.sc })
  assert.equal(del.status, 200)
  rows = await auditRows('serviceRequest', srId)
  assert.equal(rows.length, 3)
  assert.equal(rows[2].action, 'delete')
  assert.equal(rows[2].changes.snapshot.description, 'audit probe')
})

test('VSS sign-up and release write update audit rows attributed to the volunteer user', async () => {
  // Mirror tests/volunteer-requests/vss.test.js: an Open SR with a real
  // 'Ride: ...' serviceName prefix (fixture SRs use 'Ride to pharmacy', which
  // matches no capability), created as sc, signed up/released as vssJoe.
  const quahogPerson = String(persons.quahogVolunteer.id)
  const { status: createStatus, json: createJson } = await vgCall('createServiceRequest', {}, {
    token: tokens.users.sc,
    body: {
      villageId: String(villages.quahog.id),
      memberPersonId: String(persons.quahogMember.id),
      serviceName: 'Ride: Medical appointment',
      destination: 'Somewhere',
      serviceDate: '2026-08-01',
    },
  })
  assert.equal(createStatus, 201)
  const srId = String(createJson.serviceRequestId)
  vssCreatedIds.push(srId)

  const rowsBefore = await auditRows('serviceRequest', srId)

  const signUp = await vgCall('signUpVolunteerRequest', { serviceRequestId: srId }, {
    token: tokens.users.vssJoe, body: { personId: quahogPerson },
  })
  assert.equal(signUp.status, 200)

  let rows = await auditRows('serviceRequest', srId)
  assert.equal(rows.length, rowsBefore.length + 1)
  let last = rows[rows.length - 1]
  assert.equal(last.action, 'update')
  assert.equal(last.userId, VSS_JOE_ID)
  assert.deepEqual(last.changes.diff.status, { old: 'Open', new: 'Confirmed' })
  assert.ok('volunteerPersonId' in last.changes.diff, 'volunteerPersonId change present in diff')

  const release = await vgCall('releaseVolunteerRequest', { serviceRequestId: srId }, {
    token: tokens.users.vssJoe,
  })
  assert.equal(release.status, 200)

  rows = await auditRows('serviceRequest', srId)
  assert.equal(rows.length, rowsBefore.length + 2)
  last = rows[rows.length - 1]
  assert.equal(last.action, 'update')
  assert.equal(last.userId, VSS_JOE_ID)
  assert.deepEqual(last.changes.diff.status, { old: 'Confirmed', new: 'Open' })
})
