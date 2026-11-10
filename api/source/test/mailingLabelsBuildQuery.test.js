'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { buildRecipientQuery } = require('../service/mailingLabels/buildQuery')

// The exact SQL the pre-refactor printedNewsletter.js hand-wrote, plus
// p.suffix (0027 moved suffixes out of lastName) and p.nickname (for the
// CSV's nickname salutation). The printed-newsletter/
// member shape must reproduce it byte-for-byte.
const LEGACY_PRINTED_NEWSLETTER_SQL = `
    SELECT
      p.firstName,
      p.lastName,
      p.suffix,
      p.nickname,
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
  const { sql, binds } = buildRecipientQuery({ audience: 'printed-newsletter', roles: ['member'] })
  assert.equal(sql, LEGACY_PRINTED_NEWSLETTER_SQL)
  assert.deepEqual(binds, [])
})

test('roster/member omits WHERE entirely rather than dangling it', () => {
  const { sql, binds } = buildRecipientQuery({ audience: 'roster', roles: ['member'] })
  assert.match(sql, /INNER JOIN active_member m ON m\.personId = p\.id/)
  assert.ok(!/WHERE/.test(sql), `roster SQL must not contain WHERE:\n${sql}`)
  assert.deepEqual(binds, [])
})

test('roster/volunteer joins active_volunteer, not active_member', () => {
  const { sql } = buildRecipientQuery({ audience: 'roster', roles: ['volunteer'] })
  assert.match(sql, /INNER JOIN active_volunteer vol ON vol\.personId = p\.id/)
  assert.ok(!sql.includes('active_member'))
})

test('roster/member+volunteer uses EXISTS on both views and no role join', () => {
  const { sql, binds } = buildRecipientQuery({ audience: 'roster', roles: ['member', 'volunteer'] })
  assert.match(sql, /EXISTS \(SELECT 1 FROM active_member m WHERE m\.personId = p\.id\)/)
  assert.match(sql, /EXISTS \(SELECT 1 FROM active_volunteer vol WHERE vol\.personId = p\.id\)/)
  // Absence, not just presence: a person who is both member and volunteer
  // must yield ONE row, so no INNER JOIN on either view may appear.
  assert.ok(!sql.includes('INNER JOIN'), `member+volunteer must not join:\n${sql}`)
  assert.deepEqual(binds, [])
})

test('villageId filters on person.villageId with no village join', () => {
  const { sql, binds } = buildRecipientQuery({ audience: 'roster', roles: ['member'], villageId: 5 })
  assert.match(sql, /WHERE p\.villageId = \?/)
  assert.ok(!sql.includes('JOIN village'), `must not join village:\n${sql}`)
  assert.deepEqual(binds, [5])
})

test('birthday-month binds the month for any role', () => {
  for (const roles of [['member'], ['volunteer'], ['member', 'volunteer']]) {
    const { sql, binds } = buildRecipientQuery({ audience: 'birthday-month', roles, month: 3 })
    assert.match(sql, /MONTH\(p\.birthDate\) = \?/)
    assert.deepEqual(binds, [3], `roles ${roles}`)
  }
})

test('join-month/member binds the month against member.joinDate', () => {
  const { sql, binds } = buildRecipientQuery({ audience: 'join-month', roles: ['member'], month: 6 })
  assert.match(sql, /MONTH\(m\.joinDate\) = \?/)
  assert.deepEqual(binds, [6])
})

test('villageId binds before month', () => {
  const { binds } = buildRecipientQuery({ audience: 'birthday-month', roles: ['member', 'volunteer'], villageId: 2, month: 12 })
  assert.deepEqual(binds, [2, 12])
})

test('every shape selects the seven label columns with padded zip', () => {
  for (const spec of [
    { audience: 'roster', roles: ['member'] },
    { audience: 'roster', roles: ['member', 'volunteer'], villageId: 1 },
    { audience: 'printed-newsletter', roles: ['member'] },
    { audience: 'birthday-month', roles: ['volunteer'], month: 1 },
  ]) {
    const { sql } = buildRecipientQuery(spec)
    for (const col of ['p.firstName', 'p.lastName', 'p.suffix', 'p.nickname', 'p.street', 'p.unit', 'p.city', 'p.state']) {
      assert.ok(sql.includes(col), `${col} missing from ${JSON.stringify(spec)}`)
    }
    assert.match(sql, /LPAD\(p\.zip, 5, '0'\) AS zip/)
  }
})

test('empty, unknown and old combined roles throw; unknown audience throws', () => {
  assert.throws(() => buildRecipientQuery({ audience: 'roster', roles: ['nobody'] }), /unknown role/i)
  assert.throws(() => buildRecipientQuery({ audience: 'roster', roles: ['either'] }), /unknown role/i)
  assert.throws(() => buildRecipientQuery({ audience: 'roster', roles: [] }), /at least one role/i)
  assert.throws(() => buildRecipientQuery({ audience: 'roster' }), /at least one role/i)
  assert.throws(() => buildRecipientQuery({ audience: 'holiday', roles: ['member'] }), /unknown audience/i)
})

test('member-only audiences throw unless roles is exactly [member]', () => {
  assert.throws(() => buildRecipientQuery({ audience: 'printed-newsletter', roles: ['volunteer'] }), /requires role member only/i)
  assert.throws(() => buildRecipientQuery({ audience: 'join-month', roles: ['member', 'volunteer'], month: 4 }), /requires role member only/i)
  assert.throws(() => buildRecipientQuery({ audience: 'printed-newsletter', roles: ['member', 'volunteer'] }), /requires role member only/i)
})

test('month audiences throw without a month', () => {
  assert.throws(() => buildRecipientQuery({ audience: 'birthday-month', roles: ['member'] }), /requires month/i)
  assert.throws(() => buildRecipientQuery({ audience: 'join-month', roles: ['member'] }), /requires month/i)
})

test('non-month audiences throw when month is supplied', () => {
  assert.throws(() => buildRecipientQuery({ audience: 'roster', roles: ['member'], month: 5 }), /does not accept month/i)
  assert.throws(() => buildRecipientQuery({ audience: 'printed-newsletter', roles: ['member'], month: 5 }), /does not accept month/i)
})

test('roster/donor uses EXISTS on donor and excludes the deceased', () => {
  const { sql, binds } = buildRecipientQuery({ audience: 'roster', roles: ['donor'] })
  assert.match(sql, /p\.deceased = 0/)
  assert.match(sql, /EXISTS \(SELECT 1 FROM donor d WHERE d\.personId = p\.id\)/)
  assert.ok(!/INNER JOIN/.test(sql), `donor SQL must not join:\n${sql}`)
  assert.deepEqual(binds, [])
})

test('roster/donor with lastGiftSince binds the cutoff', () => {
  const { sql, binds } = buildRecipientQuery({ audience: 'roster', roles: ['donor'], lastGiftSince: '2021-11-09' })
  assert.match(sql, /d\.lastGiftDate >= \?/)
  assert.deepEqual(binds, ['2021-11-09'])
})

test('roster/all three ORs member, volunteer and donor', () => {
  const { sql } = buildRecipientQuery({ audience: 'roster', roles: ['member', 'volunteer', 'donor'] })
  assert.match(sql, /EXISTS \(SELECT 1 FROM active_member m WHERE m\.personId = p\.id\)/)
  assert.match(sql, /EXISTS \(SELECT 1 FROM active_volunteer vol WHERE vol\.personId = p\.id\)/)
  assert.match(sql, /EXISTS \(SELECT 1 FROM donor d WHERE d\.personId = p\.id\)/)
  // The deceased check belongs to the donor branch only: the active views
  // already cover members and volunteers.
  assert.equal(sql.match(/p\.deceased = 0/g).length, 1)
  assert.match(sql, /OR \(p\.deceased = 0 AND EXISTS \(SELECT 1 FROM donor d/)
  assert.ok(!/INNER JOIN/.test(sql), `all-three SQL must not join:\n${sql}`)
})

test('lastGiftSince binds before villageId', () => {
  const { binds } = buildRecipientQuery({ audience: 'roster', roles: ['donor'], lastGiftSince: '2021-11-09', villageId: 5 })
  assert.deepEqual(binds, ['2021-11-09', 5])
})

test('donor in any list throws for non-roster audiences', () => {
  assert.throws(() => buildRecipientQuery({ audience: 'birthday-month', roles: ['donor'], month: 3 }), /does not accept donor/)
  assert.throws(() => buildRecipientQuery({ audience: 'birthday-month', roles: ['member', 'donor'], month: 3 }), /does not accept donor/)
})

test('lastGiftSince throws unless roles include donor', () => {
  assert.throws(() => buildRecipientQuery({ audience: 'roster', roles: ['member', 'volunteer'], lastGiftSince: '2021-11-09' }), /lastGiftSince requires/)
  assert.throws(() => buildRecipientQuery({ audience: 'roster', roles: ['member'], lastGiftSince: '2021-11-09' }), /lastGiftSince requires/)
})

test('request order does not change SQL or binds', () => {
  const a = buildRecipientQuery({ audience: 'roster', roles: ['donor', 'member'], villageId: 3, lastGiftSince: '2021-11-10' })
  const b = buildRecipientQuery({ audience: 'roster', roles: ['member', 'donor'], villageId: 3, lastGiftSince: '2021-11-10' })
  assert.equal(a.sql, b.sql)
  assert.deepEqual(a.binds, b.binds)
  assert.deepEqual(a.binds, ['2021-11-10', 3])
})

test('member+donor ORs the member EXISTS with the donor clause, no join, no volunteer', () => {
  const { sql } = buildRecipientQuery({ audience: 'roster', roles: ['member', 'donor'] })
  assert.ok(!sql.includes('INNER JOIN'))
  assert.ok(!sql.includes('active_volunteer'))
  assert.match(sql, /EXISTS \(SELECT 1 FROM active_member m WHERE m\.personId = p\.id\) OR \(p\.deceased = 0 AND EXISTS \(SELECT 1 FROM donor d/)
})

test('volunteer+donor ORs the volunteer EXISTS with the donor clause', () => {
  const { sql } = buildRecipientQuery({ audience: 'roster', roles: ['volunteer', 'donor'] })
  assert.ok(!sql.includes('INNER JOIN'))
  assert.ok(!sql.includes('active_member'))
  assert.match(sql, /active_volunteer vol WHERE vol\.personId = p\.id\) OR \(p\.deceased = 0/)
})

test('donor with a village filters donors by person.villageId', () => {
  const { sql, binds } = buildRecipientQuery({ audience: 'roster', roles: ['donor'], villageId: 7 })
  assert.match(sql, /donor d WHERE d\.personId = p\.id\)\) AND p\.villageId = \?/)
  assert.deepEqual(binds, [7])
})

test('a combined role list is one parenthesised operand before the village filter', () => {
  const { sql } = buildRecipientQuery({ audience: 'roster', roles: ['member', 'volunteer', 'donor'], villageId: 7 })
  assert.match(sql, /WHERE \(EXISTS .* OR EXISTS .* OR \(p\.deceased = 0 .*\)\) AND p\.villageId = \?/)
})
