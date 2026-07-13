'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

const svc = require(path.join('..', 'service', 'VolunteerRequestService'))

test('classifySignUpFailure: missing rows are notFound', () => {
  assert.equal(svc.classifySignUpFailure({ row: undefined, personId: 5 }), 'notFound')
})

test('classifySignUpFailure: own confirmed request is an idempotent no-op', () => {
  assert.equal(
    svc.classifySignUpFailure({ row: { status: 'Confirmed', volunteerPersonId: 5 }, personId: 5 }),
    'alreadyOwn'
  )
})

test('classifySignUpFailure: anything else is a conflict (any village)', () => {
  assert.equal(
    svc.classifySignUpFailure({ row: { status: 'Confirmed', volunteerPersonId: 8 }, personId: 5 }),
    'conflict'
  )
  assert.equal(
    svc.classifySignUpFailure({ row: { status: 'Completed', volunteerPersonId: null }, personId: 5 }),
    'conflict'
  )
})

test('classifyReleaseFailure: missing rows are notFound, existing are conflict', () => {
  assert.equal(svc.classifyReleaseFailure({ row: undefined }), 'notFound')
  assert.equal(svc.classifyReleaseFailure({ row: { status: 'Open' } }), 'conflict')
})

test('service exports the request functions', () => {
  assert.equal(typeof svc.getVolunteerRequests, 'function')
  assert.equal(typeof svc.getVolunteerRequest, 'function')
  assert.equal(typeof svc.signUpVolunteerRequest, 'function')
  assert.equal(typeof svc.releaseVolunteerRequest, 'function')
})

test('buildCapabilityPrefixCase maps each capability to its serviceName prefix', () => {
  const sql = svc.buildCapabilityPrefixCase()
  // The four real service capabilities map to their prefixes...
  assert.match(sql, /WHEN 'Rides'\s+THEN 'Ride:'/)
  assert.match(sql, /WHEN 'Errands'\s+THEN 'Errand:'/)
  assert.match(sql, /WHEN 'Home Help'\s+THEN 'Household Chores\/Handy Help'/)
  assert.match(sql, /WHEN 'Tech Support'\s+THEN 'Tech Support'/)
  // ...and everything else derives to NULL (no pickable service type).
  assert.match(sql, /ELSE NULL/)
  // It is a single CASE expression.
  assert.match(sql, /^CASE c\.name/)
  assert.match(sql, /END$/)
})
