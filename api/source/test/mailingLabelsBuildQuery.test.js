'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { buildRecipientQuery } = require('../service/mailingLabels/audiences/buildQuery')

// The exact SQL the pre-refactor printedNewsletter.js hand-wrote. The
// federation-wide member shape must reproduce it byte-for-byte.
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

test('federation-wide member query is byte-identical to the legacy SQL', () => {
  const { sql, binds } = buildRecipientQuery({
    role: 'member',
    predicates: ['m.printedNewsletter = 1'],
  })
  assert.equal(sql, LEGACY_PRINTED_NEWSLETTER_SQL)
  assert.deepEqual(binds, [])
})

test('village query joins village and binds the name', () => {
  const { sql, binds } = buildRecipientQuery({ role: 'member', village: 'Providence' })
  assert.match(sql, /INNER JOIN active_member m ON m\.personId = p\.id/)
  assert.match(sql, /INNER JOIN village v ON v\.id = p\.villageId/)
  assert.match(sql, /WHERE v\.name = \?/)
  assert.deepEqual(binds, ['Providence'])
})

test('village name is bound, never interpolated', () => {
  const { sql, binds } = buildRecipientQuery({ role: 'member', village: 'Providence' })
  assert.ok(!sql.includes('Providence'))
  assert.deepEqual(binds, ['Providence'])
})

test('village plus predicate ANDs both, with only the village bound', () => {
  const { sql, binds } = buildRecipientQuery({
    role: 'member',
    village: 'Barrington',
    predicates: ['m.printedNewsletter = 1'],
  })
  assert.match(sql, /WHERE v\.name = \? AND m\.printedNewsletter = 1/)
  assert.deepEqual(binds, ['Barrington'])
})

test('volunteer role joins active_volunteer, not active_member', () => {
  const { sql } = buildRecipientQuery({ role: 'volunteer', village: 'Providence' })
  assert.match(sql, /INNER JOIN active_volunteer vol ON vol\.personId = p\.id/)
  assert.ok(!sql.includes('active_member'))
})

test('every shape selects the seven label columns with padded zip', () => {
  for (const spec of [
    { role: 'member' },
    { role: 'volunteer', village: 'Providence' },
  ]) {
    const { sql } = buildRecipientQuery(spec)
    for (const col of ['p.firstName', 'p.lastName', 'p.street', 'p.unit', 'p.city', 'p.state']) {
      assert.ok(sql.includes(col), `${col} missing from ${JSON.stringify(spec)}`)
    }
    assert.match(sql, /LPAD\(p\.zip, 5, '0'\) AS zip/)
  }
})

test('an unknown role throws rather than emitting join-less SQL', () => {
  assert.throws(() => buildRecipientQuery({ role: 'nobody' }), /unknown role/i)
})

test('a role-only audience omits WHERE entirely rather than dangling it', () => {
  // "Adding an audience is one row" — and the most natural next row is an
  // unqualified "all active members", with no village and no predicates.
  // A dangling WHERE is an ER_PARSE_ERROR at request time, not a bad result.
  const { sql, binds } = buildRecipientQuery({ role: 'member' })
  assert.ok(!/WHERE/.test(sql), `role-only SQL must not contain WHERE:\n${sql}`)
  assert.deepEqual(binds, [])
})
