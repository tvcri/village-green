'use strict'
const test = require('node:test')
const assert = require('node:assert')
const { interpretGeocoderResponse } = require('../service/TownResolutionService')

// Census names the coordinate axes x/y, not lon/lat: x is LONGITUDE and y is
// LATITUDE. Verified live 2026-09-11 against 283 Post Road, South Kingstown.
const COORDS = { x: -71.518224, y: 41.429478 }
const LATLON = { latitude: 41.429478, longitude: -71.518224 }
const NOWHERE = { latitude: null, longitude: null }

const sub = (basename, coordinates = COORDS) => ({
  coordinates,
  geographies: { 'County Subdivisions': [{ BASENAME: basename, NAME: `${basename} town` }] }
})

test('returns the BASENAME when one match', () => {
  const json = { result: { addressMatches: [sub('South Kingstown')] } }
  assert.deepEqual(interpretGeocoderResponse(json), { town: 'South Kingstown', ...LATLON })
})

test('returns BASENAME verbatim for out-of-region municipalities', () => {
  const json = { result: { addressMatches: [sub('Seattle')] } }
  assert.deepEqual(interpretGeocoderResponse(json), { town: 'Seattle', ...LATLON })
})

test('returns the town when several matches agree', () => {
  const json = { result: { addressMatches: [sub('Hopkinton'), sub('Hopkinton')] } }
  assert.deepEqual(interpretGeocoderResponse(json), { town: 'Hopkinton', ...LATLON })
})

test('refuses when candidate matches disagree', () => {
  const json = { result: { addressMatches: [sub('Hopkinton'), sub('Richmond')] } }
  assert.equal(interpretGeocoderResponse(json).town, null)
})

test('returns null for no matches', () => {
  assert.deepEqual(interpretGeocoderResponse({ result: { addressMatches: [] } }), { town: null, ...NOWHERE })
})

test('returns null for malformed input', () => {
  assert.deepEqual(interpretGeocoderResponse({}), { town: null, ...NOWHERE })
  assert.deepEqual(interpretGeocoderResponse(null), { town: null, ...NOWHERE })
})

test('returns null when BASENAME is missing or empty', () => {
  const missing = { result: { addressMatches: [{ coordinates: COORDS, geographies: { 'County Subdivisions': [{ NAME: 'X town' }] } }] } }
  assert.deepEqual(interpretGeocoderResponse(missing), { town: null, ...LATLON })
  const empty = { result: { addressMatches: [sub('')] } }
  assert.deepEqual(interpretGeocoderResponse(empty), { town: null, ...LATLON })
})

// --- coordinates ---------------------------------------------------------
//
// Coordinates deliberately do NOT inherit the town's agreement rule. A wrong
// municipality misroutes services, so a disputed town is refused; coordinates
// only centre a map-search bias circle, where two candidates a few hundred
// metres apart are equally serviceable. Refusing them would drop the bias back
// to its statewide fallback for exactly the border addresses that most need a
// local centre.
test('returns coordinates even when the town is refused', () => {
  const json = { result: { addressMatches: [sub('Hopkinton'), sub('Richmond', { x: -71.7, y: 41.5 })] } }
  assert.deepEqual(interpretGeocoderResponse(json), { town: null, ...LATLON })
})

test('takes the coordinates from the first match', () => {
  const json = { result: { addressMatches: [sub('Hopkinton'), sub('Hopkinton', { x: -71.7, y: 41.5 })] } }
  assert.deepEqual(interpretGeocoderResponse(json), { town: 'Hopkinton', ...LATLON })
})

test('returns null coordinates when the match carries none or they are unusable', () => {
  const none = { result: { addressMatches: [{ geographies: { 'County Subdivisions': [{ BASENAME: 'Hopkinton' }] } }] } }
  assert.deepEqual(interpretGeocoderResponse(none), { town: 'Hopkinton', ...NOWHERE })
  const partial = { result: { addressMatches: [sub('Hopkinton', { x: -71.5 })] } }
  assert.deepEqual(interpretGeocoderResponse(partial), { town: 'Hopkinton', ...NOWHERE })
  const junk = { result: { addressMatches: [sub('Hopkinton', { x: 'abc', y: 'def' })] } }
  assert.deepEqual(interpretGeocoderResponse(junk), { town: 'Hopkinton', ...NOWHERE })
})

// 0 is a real coordinate (the Gulf of Guinea) and must not be discarded as
// falsy — the guard is Number.isFinite, not truthiness.
test('does not discard a zero coordinate as missing', () => {
  const json = { result: { addressMatches: [sub('Nowhere', { x: 0, y: 0 })] } }
  assert.deepEqual(interpretGeocoderResponse(json), { town: 'Nowhere', latitude: 0, longitude: 0 })
})

// ...but the inputs that COERCE to 0 must not be mistaken for one. Number(null),
// Number('') and Number([]) are all 0, which is finite and passes every
// downstream guard, silently relocating the bias circle to the Gulf of Guinea.
test('rejects axis values that coerce to a zero coordinate', () => {
  for (const coords of [
    { x: null, y: null },
    { x: -71.5, y: null },
    { x: null, y: 41.4 },
    { x: '', y: '' },
    { x: '  ', y: '  ' },
    { x: [], y: [] },
    { x: true, y: true }
  ]) {
    const json = { result: { addressMatches: [sub('Hopkinton', coords)] } }
    assert.deepEqual(interpretGeocoderResponse(json), { town: 'Hopkinton', ...NOWHERE },
      `expected null coordinates for ${JSON.stringify(coords)}`)
  }
})

// Census sends the axes as JSON numbers, but a numeric string is still a
// usable coordinate and is converted rather than refused.
test('accepts numeric-string axis values', () => {
  const json = { result: { addressMatches: [sub('Hopkinton', { x: '-71.518224', y: '41.429478' })] } }
  assert.deepEqual(interpretGeocoderResponse(json), { town: 'Hopkinton', ...LATLON })
})
