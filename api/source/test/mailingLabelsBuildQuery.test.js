'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { buildRecipientQuery } = require('../service/mailingLabels/buildQuery')

// The exact SQL the pre-refactor printedNewsletter.js hand-wrote. The
// printed-newsletter/member shape must still reproduce it byte-for-byte —
// the vocabulary changed around it, the query did not.
const LEGACY_PRINTED_NEWSLETTER_SQL = `
    SELECT
      p.firstName,
      p.lastName,
      p.street,
      p.unit,
      p.city,
      p.state,
      LPAD(p.zip, 5, '0') AS zip
    FROM person p
    INNER JOIN active_member m ON m.personId = p.id
    WHERE m.printedNewsletter = 1
  `

test('printed-newsletter/member is byte-identical to the legacy SQL', () => {
  const { sql, binds } = buildRecipientQuery({ audience: 'printed-newsletter', role: 'member' })
  assert.equal(sql, LEGACY_PRINTED_NEWSLETTER_SQL)
  assert.deepEqual(binds, [])
})

test('roster/member omits WHERE entirely rather than dangling it', () => {
  const { sql, binds } = buildRecipientQuery({ audience: 'roster', role: 'member' })
  assert.match(sql, /INNER JOIN active_member m ON m\.personId = p\.id/)
  assert.ok(!/WHERE/.test(sql), `roster SQL must not contain WHERE:\n${sql}`)
  assert.deepEqual(binds, [])
})

test('roster/volunteer joins active_volunteer, not active_member', () => {
  const { sql } = buildRecipientQuery({ audience: 'roster', role: 'volunteer' })
  assert.match(sql, /INNER JOIN active_volunteer vol ON vol\.personId = p\.id/)
  assert.ok(!sql.includes('active_member'))
})

test('roster/either uses EXISTS on both views and no role join', () => {
  const { sql, binds } = buildRecipientQuery({ audience: 'roster', role: 'either' })
  assert.match(sql, /EXISTS \(SELECT 1 FROM active_member m WHERE m\.personId = p\.id\)/)
  assert.match(sql, /EXISTS \(SELECT 1 FROM active_volunteer vol WHERE vol\.personId = p\.id\)/)
  // Absence, not just presence: a person who is both member and volunteer
  // must yield ONE row, so no INNER JOIN on either view may appear.
  assert.ok(!sql.includes('INNER JOIN'), `either must not join:\n${sql}`)
  assert.deepEqual(binds, [])
})

test('villageId filters on person.villageId with no village join', () => {
  const { sql, binds } = buildRecipientQuery({ audience: 'roster', role: 'member', villageId: 5 })
  assert.match(sql, /WHERE p\.villageId = \?/)
  assert.ok(!sql.includes('JOIN village'), `must not join village:\n${sql}`)
  assert.deepEqual(binds, [5])
})

test('birthday-month binds the month for any role', () => {
  for (const role of ['member', 'volunteer', 'either']) {
    const { sql, binds } = buildRecipientQuery({ audience: 'birthday-month', role, month: 3 })
    assert.match(sql, /MONTH\(p\.birthDate\) = \?/)
    assert.deepEqual(binds, [3], `role ${role}`)
  }
})

test('join-month/member binds the month against member.joinDate', () => {
  const { sql, binds } = buildRecipientQuery({ audience: 'join-month', role: 'member', month: 6 })
  assert.match(sql, /MONTH\(m\.joinDate\) = \?/)
  assert.deepEqual(binds, [6])
})

test('villageId binds before month', () => {
  const { binds } = buildRecipientQuery({ audience: 'birthday-month', role: 'either', villageId: 2, month: 12 })
  assert.deepEqual(binds, [2, 12])
})

test('every shape selects the seven label columns with padded zip', () => {
  for (const spec of [
    { audience: 'roster', role: 'member' },
    { audience: 'roster', role: 'either', villageId: 1 },
    { audience: 'printed-newsletter', role: 'member' },
    { audience: 'birthday-month', role: 'volunteer', month: 1 },
  ]) {
    const { sql } = buildRecipientQuery(spec)
    for (const col of ['p.firstName', 'p.lastName', 'p.street', 'p.unit', 'p.city', 'p.state']) {
      assert.ok(sql.includes(col), `${col} missing from ${JSON.stringify(spec)}`)
    }
    assert.match(sql, /LPAD\(p\.zip, 5, '0'\) AS zip/)
  }
})

test('unknown role and unknown audience throw', () => {
  assert.throws(() => buildRecipientQuery({ audience: 'roster', role: 'nobody' }), /unknown role/i)
  assert.throws(() => buildRecipientQuery({ audience: 'holiday', role: 'member' }), /unknown audience/i)
})

test('member-only audiences throw without role=member', () => {
  assert.throws(() => buildRecipientQuery({ audience: 'printed-newsletter', role: 'volunteer' }), /requires role member/i)
  assert.throws(() => buildRecipientQuery({ audience: 'join-month', role: 'either', month: 4 }), /requires role member/i)
})

test('month audiences throw without a month', () => {
  assert.throws(() => buildRecipientQuery({ audience: 'birthday-month', role: 'member' }), /requires month/i)
  assert.throws(() => buildRecipientQuery({ audience: 'join-month', role: 'member' }), /requires month/i)
})

test('non-month audiences throw when month is supplied', () => {
  assert.throws(() => buildRecipientQuery({ audience: 'roster', role: 'member', month: 5 }), /does not accept month/i)
  assert.throws(() => buildRecipientQuery({ audience: 'printed-newsletter', role: 'member', month: 5 }), /does not accept month/i)
})
