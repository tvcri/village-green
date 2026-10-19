'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const {
  normalizeAddress, composeName, composeSalutations, groupByAddress,
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

test('composeName: a suffix follows the surname', () => {
  assert.equal(composeName([at('Robert', 'Currie', 'x', { suffix: 'Jr.' })]), 'Robert Currie Jr.')
})

test('composeName: shared surname with a suffix is not compressed', () => {
  // "Jane and John Smith Jr." would give Jane the suffix; spell both out.
  const out = composeName([at('John', 'Smith', 'x', { suffix: 'Jr.' }), at('Jane', 'Smith', 'x')])
  assert.equal(out, 'Jane Smith and John Smith Jr.')
})

test('composeName: three or more collapses to "and others"', () => {
  const out = composeName([
    at('John', 'Smith', 'x'), at('Jane', 'Smith', 'x'), at('Kim', 'Smith', 'x'),
  ])
  assert.equal(out, 'Jane Smith and others')
})

test('composeSalutations: one recipient', () => {
  assert.deepEqual(composeSalutations([at('Harry', 'Iannotti', 'x')]),
    { firstName: 'Harry', nickname: 'Harry', fullName: 'Harry Iannotti' })
})

test('composeSalutations: names only, no greeting word or punctuation', () => {
  // "Dear" and the comma belong to the letter template in Word.
  const out = composeSalutations([at('Robert', 'Miller', 'x'), at('Barbara', 'Miller', 'x')])
  assert.deepEqual(out, {
    firstName: 'Barbara and Robert',
    nickname: 'Barbara and Robert',
    fullName: 'Barbara and Robert Miller',
  })
})

test('composeSalutations: differing surnames spell out each full name', () => {
  const out = composeSalutations([at('Lora', 'Urbanelli', 'x'), at('Bill', 'Rae', 'x')])
  assert.equal(out.firstName, 'Bill and Lora')
  assert.equal(out.fullName, 'Bill Rae and Lora Urbanelli')
})

test('composeSalutations: three or more names everyone', () => {
  // The label collapses to "and others"; a greeting cannot.
  const out = composeSalutations([
    at('Mike', 'Iannotti', 'x'), at('Harry', 'Iannotti', 'x'), at('Judith', 'Iannotti', 'x', { nickname: 'Judy' }),
  ])
  assert.equal(out.firstName, 'Harry, Judith and Mike')
  assert.equal(out.nickname, 'Harry, Judy and Mike')
  assert.equal(out.fullName, 'Harry, Judith and Mike Iannotti')
})

test('composeSalutations: a suffix blocks the shared-surname compression', () => {
  const out = composeSalutations([at('John', 'Smith', 'x', { suffix: 'Jr.' }), at('Jane', 'Smith', 'x')])
  assert.equal(out.fullName, 'Jane Smith and John Smith Jr.')
})

test('composeSalutations: nickname column wins over the first name', () => {
  const out = composeSalutations([at('Robert', 'Miller', 'x', { nickname: 'Bob' })])
  assert.equal(out.firstName, 'Robert')
  assert.equal(out.nickname, 'Bob')
})

test('composeSalutations: a "(nickname)" typed into firstName is removed, and used as the nickname', () => {
  const out = composeSalutations([at('Anne (Nancy)', 'Smith', 'x')])
  assert.deepEqual(out, { firstName: 'Anne', nickname: 'Nancy', fullName: 'Anne Smith' })
})

test('composeSalutations: the nickname column beats a parenthesized one', () => {
  const out = composeSalutations([at('Marcia (Marcy)', 'Miller', 'x', { nickname: 'Marce' })])
  assert.equal(out.nickname, 'Marce')
})

test('composeSalutations: a blank nickname falls back to the first name', () => {
  assert.equal(composeSalutations([at('Robert', 'Miller', 'x', { nickname: '  ' })]).nickname, 'Robert')
})

test('composeSalutations: a missing first name falls back to the full name', () => {
  assert.equal(composeSalutations([at('', 'Smith', 'x')]).firstName, 'Smith')
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

test('groupByAddress exposes sortLastName from the primary recipient', () => {
  const result = groupByAddress([at('Anna', 'Chianesi', '1 A St')])
  assert.equal(result.labels[0].sortLastName, 'Chianesi')
})

test('groupByAddress sortLastName is the byName-first surname for a household', () => {
  // Composed name reads "Jane and John Smith", but the sort key is the real
  // last name of the alphabetically-first recipient — so the label sorts
  // under S regardless of the "First and First Surname" display order.
  const result = groupByAddress([
    at('John', 'Smith', '123 Main St'),
    at('Jane', 'Smith', '123 Main St'),
  ])
  assert.equal(result.labels.length, 1)
  assert.equal(result.labels[0].name, 'Jane and John Smith')
  assert.equal(result.labels[0].sortLastName, 'Smith')
})

test('groupByAddress gives each label the salutations for its recipients', () => {
  const result = groupByAddress([
    at('John', 'Smith', '123 Main St'),
    at('Jane', 'Smith', '123 Main St'),
    at('Pat', 'Jones', '456 Oak Ave', { zip: '05999' }),
  ])
  assert.deepEqual(result.labels.map(l => l.salutations.firstName), ['Jane and John', 'Pat'])
})
