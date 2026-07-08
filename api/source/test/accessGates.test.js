'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

const gates = require(path.join('..', 'utils', 'accessGates'))
const SmError = require(path.join('..', 'utils', 'error'))

test('ConflictError carries status 409', () => {
  const e = new SmError.ConflictError('nope')
  assert.equal(e.status, 409)
  assert.equal(e.detail, 'nope')
})

test('isStaffGateExempt matches exact prefixes and their subpaths only', () => {
  assert.equal(gates.isStaffGateExempt('/user'), true)
  assert.equal(gates.isStaffGateExempt('/user/web-preferences'), true)
  assert.equal(gates.isStaffGateExempt('/op/definition'), true)
  assert.equal(gates.isStaffGateExempt('/privacy/acknowledgements'), true)
  assert.equal(gates.isStaffGateExempt('/oauth/token'), true)
  assert.equal(gates.isStaffGateExempt('/volunteer-requests'), true)
  assert.equal(gates.isStaffGateExempt('/volunteer-requests/12/pickup'), true)
  // NOT exempt: staff surface
  assert.equal(gates.isStaffGateExempt('/users'), false)          // no prefix bleed from /user
  assert.equal(gates.isStaffGateExempt('/persons'), false)
  assert.equal(gates.isStaffGateExempt('/service-requests/12'), false)
  assert.equal(gates.isStaffGateExempt('/villages/3/members'), false)
})

test('hasStaffAccess requires a grant or the admin privilege', () => {
  assert.equal(gates.hasStaffAccess({ privileges: { admin: true }, grants: {} }), true)
  assert.equal(gates.hasStaffAccess({ privileges: { admin: false }, grants: { 3: {} } }), true)
  assert.equal(gates.hasStaffAccess({ privileges: { admin: false }, grants: {} }), false)
  assert.equal(gates.hasStaffAccess({}), false)
  assert.equal(gates.hasStaffAccess(undefined), false)
})
