'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

const svc = require(path.join('..', 'service', 'VolunteerRequestService'))

test('classifyPickupFailure: invisible rows are notFound (no existence leak)', () => {
  assert.equal(svc.classifyPickupFailure({ row: undefined, personId: 5, villageIds: ['3'] }), 'notFound')
  assert.equal(
    svc.classifyPickupFailure({ row: { villageId: 9, status: 'Open', volunteerPersonId: null }, personId: 5, villageIds: ['3'] }),
    'notFound'
  )
})

test('classifyPickupFailure: own confirmed request is an idempotent no-op', () => {
  assert.equal(
    svc.classifyPickupFailure({ row: { villageId: 3, status: 'Confirmed', volunteerPersonId: 5 }, personId: 5, villageIds: ['3'] }),
    'alreadyOwn'
  )
})

test('classifyPickupFailure: anything else visible is a conflict', () => {
  assert.equal(
    svc.classifyPickupFailure({ row: { villageId: 3, status: 'Confirmed', volunteerPersonId: 8 }, personId: 5, villageIds: ['3'] }),
    'conflict'
  )
  assert.equal(
    svc.classifyPickupFailure({ row: { villageId: 3, status: 'Completed', volunteerPersonId: null }, personId: 5, villageIds: ['3'] }),
    'conflict'
  )
})

test('classifyReleaseFailure: invisible rows are notFound, visible are conflict', () => {
  assert.equal(svc.classifyReleaseFailure({ row: undefined, villageIds: ['3'] }), 'notFound')
  assert.equal(svc.classifyReleaseFailure({ row: { villageId: 9 }, villageIds: ['3'] }), 'notFound')
  assert.equal(svc.classifyReleaseFailure({ row: { villageId: 3 }, villageIds: ['3'] }), 'conflict')
})

test('service exports the request functions', () => {
  assert.equal(typeof svc.getVolunteerRequests, 'function')
  assert.equal(typeof svc.getVolunteerRequest, 'function')
  assert.equal(typeof svc.pickupVolunteerRequest, 'function')
  assert.equal(typeof svc.releaseVolunteerRequest, 'function')
})
