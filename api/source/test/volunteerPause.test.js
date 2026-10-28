'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { PAUSE_WORDING, pauseCovers, pauseSentence, pauseJsonSql } = require('../service/volunteerPause')

const D = '2027-03-10'

test('pauseCovers: null pause covers nothing', () => {
  assert.equal(pauseCovers(null, D), false)
})

test('pauseCovers: no dates covers every date', () => {
  assert.equal(pauseCovers({ startDate: null, endDate: null }, D), true)
})

test('pauseCovers: start date is inclusive; day before is not covered', () => {
  assert.equal(pauseCovers({ startDate: D, endDate: null }, D), true)
  assert.equal(pauseCovers({ startDate: '2027-03-11', endDate: null }, D), false)
})

test('pauseCovers: end date is inclusive; day after is not covered', () => {
  assert.equal(pauseCovers({ startDate: null, endDate: D }, D), true)
  assert.equal(pauseCovers({ startDate: null, endDate: '2027-03-09' }, D), false)
})

// The one literal: pins the wording shared with the client's PAUSE_WORDING.
test('pauseSentence: pins the sentence wording shared with the client', () => {
  assert.equal(pauseSentence('Pat Example', { startDate: null, endDate: null }, '2027-02-10'),
    'Service email for Pat Example is paused.')
})

test('pauseSentence: the four forms, current-year dates without years', () => {
  const today = '2027-02-10'
  assert.equal(pauseSentence('Pat Example', { startDate: '2027-03-01', endDate: '2027-03-15' }, today),
    `${PAUSE_WORDING.sentence('Pat Example')} Mar 1 – Mar 15.`)
  assert.equal(pauseSentence('Pat Example', { startDate: '2027-03-01', endDate: null }, today),
    `${PAUSE_WORDING.sentence('Pat Example')} from Mar 1.`)
  assert.equal(pauseSentence('Pat Example', { startDate: null, endDate: '2027-03-15' }, today),
    `${PAUSE_WORDING.sentence('Pat Example')} until Mar 15.`)
  assert.equal(pauseSentence('Pat Example', { startDate: null, endDate: null }, today),
    `${PAUSE_WORDING.sentence('Pat Example')}.`)
})

test('pauseSentence: a date outside the current year shows its year', () => {
  assert.equal(pauseSentence('Pat Example', { startDate: '2026-12-01', endDate: '2027-02-01' }, '2026-11-20'),
    `${PAUSE_WORDING.sentence('Pat Example')} Dec 1 – Feb 1, 2027.`)
})

test('pauseJsonSql builds a scalar subquery on the given alias', () => {
  const sql = pauseJsonSql('vol3')
  assert.match(sql, /volunteer_pause/)
  assert.match(sql, /vol3\.id/)
})
