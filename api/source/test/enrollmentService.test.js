'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const EnrollmentService = require(path.join('..', 'service', 'EnrollmentService'))

test('generatePin returns a 6-digit numeric string', () => {
  for (let i = 0; i < 200; i++) {
    assert.match(EnrollmentService.generatePin(), /^[0-9]{6}$/)
  }
})

// The Keycloak realm policy is length >= 8, 1 upper, 1 lower, 1 special.
// base64url output could never satisfy the special-char rule, so every
// enrollment password reset failed with invalidPasswordMinSpecialCharsMessage.
test('generateTempPassword satisfies the Keycloak password policy', () => {
  for (let i = 0; i < 500; i++) {
    const pw = EnrollmentService.generateTempPassword()
    assert.ok(pw.length >= 8, `too short: ${pw}`)
    assert.match(pw, /[A-Z]/, `no uppercase: ${pw}`)
    assert.match(pw, /[a-z]/, `no lowercase: ${pw}`)
    assert.match(pw, /[^A-Za-z0-9]/, `no special character: ${pw}`)
  }
})

test('generateTempPassword excludes look-alike characters', () => {
  for (let i = 0; i < 200; i++) {
    assert.doesNotMatch(EnrollmentService.generateTempPassword(), /[O0Il1]/)
  }
})

test('generateTempPassword does not repeat', () => {
  const seen = new Set()
  for (let i = 0; i < 500; i++) {
    seen.add(EnrollmentService.generateTempPassword())
  }
  assert.equal(seen.size, 500)
})

test('classifyEligibility prefers a volunteer row', () => {
  const rows = [
    { id: 1, firstName: 'Mem', isVolunteer: 0, isMember: 1 },
    { id: 2, firstName: 'Vol', isVolunteer: 1, isMember: 0 },
  ]
  assert.deepEqual(EnrollmentService.classifyEligibility(rows),
    { status: 'volunteer', personId: 2, firstName: 'Vol' })
})

test('classifyEligibility reports member_only when no volunteer row', () => {
  const rows = [{ id: 3, firstName: 'Mem', isVolunteer: 0, isMember: 1 }]
  assert.deepEqual(EnrollmentService.classifyEligibility(rows),
    { status: 'member_only', personId: 3, firstName: 'Mem' })
})

test('classifyEligibility reports not_found for no rows or role-less rows', () => {
  assert.equal(EnrollmentService.classifyEligibility([]).status, 'not_found')
  assert.equal(
    EnrollmentService.classifyEligibility([{ id: 4, firstName: 'X', isVolunteer: 0, isMember: 0 }]).status,
    'not_found')
})

test('normalizeEmail lowercases and trims', () => {
  assert.equal(EnrollmentService.normalizeEmail('  Jane@Example.COM '), 'jane@example.com')
})
