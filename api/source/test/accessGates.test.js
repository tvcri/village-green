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
  assert.equal(gates.isStaffGateExempt('/volunteer-requests/12/sign-up'), true)
  // NOT exempt: staff surface
  assert.equal(gates.isStaffGateExempt('/users'), false)          // no prefix bleed from /user
  assert.equal(gates.isStaffGateExempt('/persons'), false)
  assert.equal(gates.isStaffGateExempt('/service-requests/12'), false)
  assert.equal(gates.isStaffGateExempt('/villages/3/members'), false)
})

test('hasStaffAccess requires a village or federation role grant', () => {
  assert.equal(gates.hasStaffAccess({ federationGrants: [{ grantId: '1' }], grants: {} }), true)
  assert.equal(gates.hasStaffAccess({ federationGrants: [], grants: { 3: {} } }), true)
  assert.equal(gates.hasStaffAccess({ federationGrants: [], grants: {} }), false)
  assert.equal(gates.hasStaffAccess({}), false)
  assert.equal(gates.hasStaffAccess(undefined), false)
})
