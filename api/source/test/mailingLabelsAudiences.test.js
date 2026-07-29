'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { getAudience, listAudiences } = require('../service/mailingLabels/audiences')

const EXPECTED = [
  ['printed-newsletter', 'Printed newsletter - All'],
  ['barrington-newsletter-members', 'Printed newsletter - Barrington'],
  ['bristol-warren-members', 'Members - Bristol-Warren'],
  ['providence-members', 'Members - Providence'],
  ['providence-volunteers', 'Volunteers - Providence'],
]

test('registry lists the five audiences in display order', () => {
  assert.deepEqual(listAudiences().map(a => [a.id, a.label]), EXPECTED)
})

test('every audience carries the controller-required shape', () => {
  for (const a of listAudiences()) {
    assert.equal(a.permission, 'person:read', `${a.id} permission`)
    assert.equal(a.scope, 'federation', `${a.id} scope`)
    assert.deepEqual(a.params, [], `${a.id} params`)
    assert.equal(typeof a.query, 'function', `${a.id} query`)
    assert.ok(a.description?.length > 0, `${a.id} description`)
  }
})

test('getAudience resolves by id and returns undefined otherwise', () => {
  assert.equal(getAudience('providence-members').label, 'Members - Providence')
  assert.equal(getAudience('no-such-audience'), undefined)
})

test('an explicit query function overrides the declarative path', () => {
  // The escape hatch: a future audience needing a UNION or a date range
  // supplies its own query and must not be rebuilt from village/role.
  const { buildAudience } = require('../service/mailingLabels/audiences')
  const sentinel = async () => ['sentinel']
  const built = buildAudience({ id: 'x', label: 'X', description: 'X', query: sentinel })
  assert.equal(built.query, sentinel)
})
