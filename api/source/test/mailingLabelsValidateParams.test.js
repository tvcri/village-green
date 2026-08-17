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
  throws422({ audience: 'birthday-month', role: 'member' }, /requires month/i)
  throws422({ audience: 'join-month', role: 'member' }, /requires month/i)
})

test('non-month audiences reject month', () => {
  throws422({ audience: 'roster', role: 'member', month: 3 }, /does not accept month/i)
  throws422({ audience: 'printed-newsletter', role: 'member', month: 3 }, /does not accept month/i)
})

test('member-only audiences require role=member', () => {
  throws422({ audience: 'printed-newsletter', role: 'volunteer' }, /requires role=member/i)
  throws422({ audience: 'printed-newsletter', role: 'either' }, /requires role=member/i)
  throws422({ audience: 'join-month', role: 'volunteer', month: 4 }, /requires role=member/i)
  throws422({ audience: 'join-month', role: 'either', month: 4 }, /requires role=member/i)
})

test('valid combinations pass', () => {
  for (const params of [
    { audience: 'roster', role: 'member' },
    { audience: 'roster', role: 'volunteer' },
    { audience: 'roster', role: 'either' },
    { audience: 'printed-newsletter', role: 'member' },
    { audience: 'birthday-month', role: 'either', month: 1 },
    { audience: 'birthday-month', role: 'volunteer', month: 12 },
    { audience: 'join-month', role: 'member', month: 6 },
  ]) {
    assert.doesNotThrow(() => validateLabelParams(params), JSON.stringify(params))
  }
})
