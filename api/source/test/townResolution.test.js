'use strict'
const test = require('node:test')
const assert = require('node:assert')
const { interpretGeocoderResponse } = require('../service/TownResolutionService')

const sub = (basename) => ({
  geographies: { 'County Subdivisions': [{ BASENAME: basename, NAME: `${basename} town` }] }
})

test('returns the BASENAME when one match', () => {
  const json = { result: { addressMatches: [sub('South Kingstown')] } }
  assert.deepEqual(interpretGeocoderResponse(json), { town: 'South Kingstown' })
})

test('returns BASENAME verbatim for out-of-region municipalities', () => {
  const json = { result: { addressMatches: [sub('Seattle')] } }
  assert.deepEqual(interpretGeocoderResponse(json), { town: 'Seattle' })
})

test('returns the town when several matches agree', () => {
  const json = { result: { addressMatches: [sub('Hopkinton'), sub('Hopkinton')] } }
  assert.deepEqual(interpretGeocoderResponse(json), { town: 'Hopkinton' })
})

test('refuses when candidate matches disagree', () => {
  const json = { result: { addressMatches: [sub('Hopkinton'), sub('Richmond')] } }
  assert.deepEqual(interpretGeocoderResponse(json), { town: null })
})

test('returns null for no matches', () => {
  assert.deepEqual(interpretGeocoderResponse({ result: { addressMatches: [] } }), { town: null })
})

test('returns null for malformed input', () => {
  assert.deepEqual(interpretGeocoderResponse({}), { town: null })
  assert.deepEqual(interpretGeocoderResponse(null), { town: null })
})

test('returns null when BASENAME is missing or empty', () => {
  const missing = { result: { addressMatches: [{ geographies: { 'County Subdivisions': [{ NAME: 'X town' }] } }] } }
  assert.deepEqual(interpretGeocoderResponse(missing), { town: null })
  const empty = { result: { addressMatches: [sub('')] } }
  assert.deepEqual(interpretGeocoderResponse(empty), { town: null })
})
