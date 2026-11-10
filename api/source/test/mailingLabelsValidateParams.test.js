'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { validateLabelParams } = require('../service/mailingLabels/validateLabelParams')

const throws422 = (params, messageRe) => {
  assert.throws(() => validateLabelParams(params), err => {
    assert.equal(err.status, 422)
    assert.match(err.detail, messageRe)
    return true
  }, JSON.stringify(params))
}

test('month audiences require month', () => {
  throws422({ audience: 'birthday-month', roles: ['member'] }, /requires month/i)
  throws422({ audience: 'join-month', roles: ['member'] }, /requires month/i)
})

test('non-month audiences reject month', () => {
  throws422({ audience: 'roster', roles: ['member'], month: 3 }, /does not accept month/i)
  throws422({ audience: 'printed-newsletter', roles: ['member'], month: 3 }, /does not accept month/i)
})

test('member-only audiences require role=member only', () => {
  throws422({ audience: 'printed-newsletter', roles: ['member', 'donor'] }, /requires role=member only/i)
  throws422({ audience: 'printed-newsletter', roles: ['volunteer'] }, /requires role=member only/i)
  throws422({ audience: 'printed-newsletter', roles: ['member', 'volunteer'] }, /requires role=member only/i)
  throws422({ audience: 'join-month', roles: ['volunteer'], month: 4 }, /requires role=member only/i)
  throws422({ audience: 'join-month', roles: ['member', 'volunteer'], month: 4 }, /requires role=member only/i)
})

test('valid combinations pass', () => {
  for (const params of [
    { audience: 'roster', roles: ['member'] },
    { audience: 'roster', roles: ['volunteer'] },
    { audience: 'roster', roles: ['member', 'volunteer'] },
    { audience: 'printed-newsletter', roles: ['member'] },
    { audience: 'birthday-month', roles: ['member', 'volunteer'], month: 1 },
    { audience: 'birthday-month', roles: ['volunteer'], month: 12 },
    { audience: 'join-month', roles: ['member'], month: 6 },
  ]) {
    assert.doesNotThrow(() => validateLabelParams(params), JSON.stringify(params))
  }
})

test('donor in any list is roster-only', () => {
  throws422({ audience: 'birthday-month', roles: ['member', 'volunteer', 'donor'], month: 3 }, /does not accept role=donor/i)
  throws422({ audience: 'birthday-month', roles: ['donor'], month: 3 }, /does not accept role=donor/i)
  throws422({ audience: 'birthday-month', roles: ['member', 'donor'], month: 3 }, /does not accept role=donor/i)
})

test('lastGiftWithinYears requires donor in the role list', () => {
  throws422({ audience: 'roster', roles: ['member', 'volunteer'], lastGiftWithinYears: 5 }, /requires role to include donor/i)
  throws422({ audience: 'roster', roles: ['volunteer'], lastGiftWithinYears: 5 }, /requires role to include donor/i)
})

test('roster accepts any list with donor, with or without lastGiftWithinYears', () => {
  for (const roles of [['donor'], ['member', 'donor'], ['volunteer', 'donor'], ['member', 'volunteer', 'donor']]) {
    assert.doesNotThrow(() => validateLabelParams({ audience: 'roster', roles }))
    assert.doesNotThrow(() => validateLabelParams({ audience: 'roster', roles, lastGiftWithinYears: 5 }))
  }
})

test('an empty role list is rejected', () => {
  throws422({ audience: 'roster', roles: [] }, /at least one role/i)
})
