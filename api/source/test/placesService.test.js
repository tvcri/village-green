'use strict'
const test = require('node:test')
const assert = require('node:assert')
const { interpretPlacesResponse, buildQuery, clampResultCount } = require('../service/PlacesService')

// Verbatim Places API (New) Text Search response for
// "Serra Physical Therapy, Barrington, RI", captured 2026-08-25.
const SERRA = {
  places: [{
    id: 'ChIJuxtkRqxR5IkRgn0NsxVSiws',
    formattedAddress: '60 Bay Spring Ave A2, Barrington, RI 02806, USA',
    addressComponents: [
      { longText: 'A2', shortText: 'A2', types: ['subpremise'], languageCode: 'en' },
      { longText: '60', shortText: '60', types: ['street_number'], languageCode: 'en-US' },
      { longText: 'Bay Spring Avenue', shortText: 'Bay Spring Ave', types: ['route'], languageCode: 'en' },
      { longText: 'Barrington', shortText: 'Barrington', types: ['locality', 'political'], languageCode: 'en' },
      { longText: 'Bristol County', shortText: 'Bristol County', types: ['administrative_area_level_2', 'political'], languageCode: 'en' },
      { longText: 'Rhode Island', shortText: 'RI', types: ['administrative_area_level_1', 'political'], languageCode: 'en' },
      { longText: 'United States', shortText: 'US', types: ['country', 'political'], languageCode: 'en' },
      { longText: '02806', shortText: '02806', types: ['postal_code'], languageCode: 'en-US' }
    ],
    displayName: { text: 'Serra Physical Therapy', languageCode: 'en' }
  }]
}

const comp = (longText, shortText, ...types) => ({ longText, shortText, types })

test('maps a real Text Search place onto service-request address fields', () => {
  assert.deepEqual(interpretPlacesResponse(SERRA), [{
    placeId: 'ChIJuxtkRqxR5IkRgn0NsxVSiws',
    name: 'Serra Physical Therapy',
    formattedAddress: '60 Bay Spring Ave A2, Barrington, RI 02806, USA',
    address: '60 Bay Spring Avenue, Suite A2',
    city: 'Barrington',
    state: 'RI',
    zip: '02806'
  }])
})

// Google's subpremise is sometimes a bare token ("A2") and sometimes carries
// its own designator ("Unit A", "Ste 105", "#2"). Only the bare form gets a
// "Suite " prefix; seen live 2026-09-08 as "Suite Unit A" before this guard.
test('prefixes "Suite" only when the subpremise has no designator of its own', () => {
  const place = (sub) => ({ places: [{ id: 'x', displayName: { text: 'X' }, formattedAddress: '',
    addressComponents: [
      comp('4705', '4705', 'street_number'),
      comp('Old Post Road', 'Old Post Rd', 'route'),
      comp(sub, sub, 'subpremise')
    ] }] })
  assert.equal(interpretPlacesResponse(place('A2'))[0].address, '4705 Old Post Road, Suite A2')
  assert.equal(interpretPlacesResponse(place('Unit A'))[0].address, '4705 Old Post Road, Unit A')
  assert.equal(interpretPlacesResponse(place('Ste 105'))[0].address, '4705 Old Post Road, Ste 105')
  assert.equal(interpretPlacesResponse(place('#2'))[0].address, '4705 Old Post Road, #2')
  assert.equal(interpretPlacesResponse(place('Suite 18'))[0].address, '4705 Old Post Road, Suite 18')
})

test('omits the suite when there is no subpremise', () => {
  const json = { places: [{
    id: 'x', displayName: { text: 'Shaw\'s' }, formattedAddress: '186 County Rd, Barrington, RI 02806, USA',
    addressComponents: [
      comp('186', '186', 'street_number'),
      comp('County Road', 'County Rd', 'route'),
      comp('Barrington', 'Barrington', 'locality', 'political'),
      comp('Rhode Island', 'RI', 'administrative_area_level_1', 'political'),
      comp('02806', '02806', 'postal_code')
    ]
  }] }
  assert.equal(interpretPlacesResponse(json)[0].address, '186 County Road')
})

test('falls back to sublocality, then admin level 3, when locality is absent', () => {
  const base = [
    comp('1', '1', 'street_number'),
    comp('Main Street', 'Main St', 'route'),
    comp('Rhode Island', 'RI', 'administrative_area_level_1', 'political'),
    comp('02879', '02879', 'postal_code')
  ]
  const sub = { places: [{ id: 'a', displayName: { text: 'A' }, formattedAddress: '',
    addressComponents: [...base, comp('Wakefield', 'Wakefield', 'sublocality', 'political')] }] }
  assert.equal(interpretPlacesResponse(sub)[0].city, 'Wakefield')

  const lvl3 = { places: [{ id: 'b', displayName: { text: 'B' }, formattedAddress: '',
    addressComponents: [...base, comp('South Kingstown', 'South Kingstown', 'administrative_area_level_3', 'political')] }] }
  assert.equal(interpretPlacesResponse(lvl3)[0].city, 'South Kingstown')
})

test('returns an empty list for no places or malformed input', () => {
  assert.deepEqual(interpretPlacesResponse({ places: [] }), [])
  assert.deepEqual(interpretPlacesResponse({}), [])
  assert.deepEqual(interpretPlacesResponse(null), [])
})

// A bare town name is ambiguous across state lines — "Hopkinton" resolves to
// Massachusetts unless the state is in the query text. Verified live
// 2026-09-08: town-only returned 8 MA results; town + state returned the one
// RI clinic. The state does NOT suppress cross-border results (Seekonk MA
// still surfaced for "Stop & Shop, Barrington, RI").
test('buildQuery appends the member town and state to the text', () => {
  assert.equal(buildQuery({ text: 'South Shore Mental Health', town: 'Hopkinton', state: 'RI' }),
    'South Shore Mental Health, Hopkinton, RI')
})

// DEMO-ONLY knob. Google's ceiling is 20 and it silently clamps anything
// higher, so clamp here where a bad value is visible rather than mysterious.
test('clampResultCount bounds the request to what Google will honour', () => {
  assert.equal(clampResultCount(15), 15)
  assert.equal(clampResultCount(1), 1)
  assert.equal(clampResultCount(20), 20)
  assert.equal(clampResultCount(21), 20)
  assert.equal(clampResultCount(0), 1)
  assert.equal(clampResultCount(-5), 1)
})

test('clampResultCount falls back to the default when unusable', () => {
  assert.equal(clampResultCount(undefined), 8)
  assert.equal(clampResultCount(null), 8)
  assert.equal(clampResultCount('12'), 12)
  assert.equal(clampResultCount('abc'), 8)
  assert.equal(clampResultCount(7.6), 7)
})

test('buildQuery tolerates a missing town or state', () => {
  assert.equal(buildQuery({ text: 'CVS', town: 'Barrington' }), 'CVS, Barrington')
  assert.equal(buildQuery({ text: 'CVS', state: 'RI' }), 'CVS, RI')
  assert.equal(buildQuery({ text: ' CVS ', town: ' ', state: '' }), 'CVS')
})

test('leaves fields empty rather than undefined when components are missing', () => {
  const json = { places: [{ id: 'p', displayName: { text: 'Somewhere' }, formattedAddress: 'Somewhere, RI', addressComponents: [] }] }
  assert.deepEqual(interpretPlacesResponse(json), [{
    placeId: 'p', name: 'Somewhere', formattedAddress: 'Somewhere, RI',
    address: '', city: '', state: '', zip: ''
  }])
})
