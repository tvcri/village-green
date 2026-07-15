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

test('generateTempPassword returns 12 URL-safe characters', () => {
  for (let i = 0; i < 50; i++) {
    assert.match(EnrollmentService.generateTempPassword(), /^[A-Za-z0-9_-]{12}$/)
  }
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
