'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const {
  normalizeAddress, composeName, groupByAddress,
} = require('../service/mailingLabels/groupByAddress')

const at = (firstName, lastName, street, extra = {}) => ({
  firstName, lastName, street,
  unit: null, city: 'Springfield', state: 'VT', zip: '05156',
  ...extra,
})

test('normalizeAddress lowercases, collapses whitespace, strips trailing punctuation', () => {
  const a = normalizeAddress(at('John', 'Smith', '  123   Main St.  '))
  const b = normalizeAddress(at('Jane', 'Smith', '123 Main St'))
  assert.equal(a, b)
})

test('normalizeAddress does NOT expand abbreviations', () => {
  const a = normalizeAddress(at('John', 'Smith', '123 Main St'))
  const b = normalizeAddress(at('Jane', 'Smith', '123 Main Street'))
  assert.notEqual(a, b)
})

test('normalizeAddress keeps distinct units distinct', () => {
  const a = normalizeAddress(at('John', 'Smith', '123 Main St', { unit: 'Apt 2' }))
  const b = normalizeAddress(at('Jane', 'Smith', '123 Main St', { unit: 'Apt 4' }))
  assert.notEqual(a, b)
})

test('composeName: one recipient', () => {
  assert.equal(composeName([at('John', 'Smith', 'x')]), 'John Smith')
})

test('composeName: two with matching surnames', () => {
  const out = composeName([at('John', 'Smith', 'x'), at('Jane', 'Smith', 'x')])
  assert.equal(out, 'Jane and John Smith')
})

test('composeName: two with differing surnames', () => {
  const out = composeName([at('John', 'Smith', 'x'), at('Jane', 'Okonkwo', 'x')])
  assert.equal(out, 'Jane Okonkwo and John Smith')
})

test('composeName: surname match is case-insensitive', () => {
  const out = composeName([at('John', 'smith', 'x'), at('Jane', 'SMITH', 'x')])
  assert.equal(out, 'Jane and John smith')
})

test('composeName: three or more collapses to "and others"', () => {
  const out = composeName([
    at('John', 'Smith', 'x'), at('Jane', 'Smith', 'x'), at('Kim', 'Smith', 'x'),
  ])
  assert.equal(out, 'Jane Smith and others')
})

test('groupByAddress merges same address, counts merges', () => {
  const result = groupByAddress([
    at('John', 'Smith', '123 Main St'),
    at('Jane', 'Smith', '123 Main St'),
    at('Pat', 'Jones', '456 Oak Ave'),
  ])
  assert.equal(result.labels.length, 2)
  assert.equal(result.summary.recipientCount, 3)
  assert.equal(result.summary.labelCount, 2)
  assert.equal(result.summary.mergedCount, 1)
})

test('groupByAddress keeps differing units as separate labels', () => {
  const result = groupByAddress([
    at('John', 'Smith', '123 Main St', { unit: 'Apt 2' }),
    at('Jane', 'Smith', '123 Main St', { unit: 'Apt 4' }),
  ])
  assert.equal(result.labels.length, 2)
})

test('groupByAddress excludes blank street as unmailable', () => {
  const result = groupByAddress([
    at('John', 'Smith', '123 Main St'),
    at('Pat', 'Nguyen', '   '),
    at('Kim', 'Lee', null),
  ])
  assert.equal(result.labels.length, 1)
  assert.equal(result.unmailable.length, 2)
  assert.equal(result.unmailable[0].reason, 'no street address')
})

test('groupByAddress sorts by zip then name', () => {
  const result = groupByAddress([
    at('Zoe', 'Zulu', '1 A St', { zip: '05999' }),
    at('Amy', 'Adams', '2 B St', { zip: '05111' }),
  ])
  assert.deepEqual(result.labels.map(l => l.zip), ['05111', '05999'])
})

test('groupByAddress on empty input returns empty result', () => {
  const result = groupByAddress([])
  assert.deepEqual(result.labels, [])
  assert.equal(result.summary.labelCount, 0)
  assert.equal(result.summary.mergedCount, 0)
})
