'use strict'
const test = require('node:test')
const assert = require('node:assert')
const { interpretPlacesResponse, buildQuery, resolveBias, RI_CENTER } = require('../service/PlacesService')

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

// --- location bias -------------------------------------------------------
//
// The bias circle is not cosmetic. On Azure App Service the Google caller IP
// is in northern Virginia, and Google's fallback when no bias is sent is
// IP-based — so the circle is the only thing keeping production results in
// Rhode Island. Locally that is masked, because the dev machine egresses
// from RI and even "no bias" looks reasonable.

const MEMBER = { latitude: 41.429478, longitude: -71.518224 } // 283 Post Rd, South Kingstown

test('centres the circle on the member when coordinates are supplied', () => {
  assert.deepEqual(resolveBias({ bias: 'member', ...MEMBER }),
    { circle: { center: MEMBER, radius: 50000 } })
})

// 'member' is the default: an omitted bias with coordinates still centres on
// them, which is what the dialog sends when the coordinator leaves it alone.
test('treats an absent bias as member-centred', () => {
  assert.deepEqual(resolveBias({ ...MEMBER }),
    { circle: { center: MEMBER, radius: 50000 } })
})

// A member whose address does not geocode must not silently lose the bias —
// that would hand production over to the Virginia IP fallback.
test('falls back to the statewide circle when coordinates are unusable', () => {
  const statewide = { circle: { center: RI_CENTER, radius: 50000 } }
  assert.deepEqual(resolveBias({ bias: 'member' }), statewide)
  assert.deepEqual(resolveBias({ bias: 'member', latitude: null, longitude: null }), statewide)
  assert.deepEqual(resolveBias({ bias: 'member', latitude: 41.4, longitude: 'abc' }), statewide)
  assert.deepEqual(resolveBias({}), statewide)
})

// Number(null) is 0, a real coordinate in the Gulf of Guinea, and null is
// exactly what a failed geocode returns — so a truthiness-free Number() guard
// silently centres the circle off Africa. Caught by the test above; pinned
// here because the null path is the common one, not an edge case.
test('does not read a null coordinate as zero', () => {
  const c = resolveBias({ bias: 'member', latitude: null, longitude: null }).circle.center
  assert.notDeepEqual(c, { latitude: 0, longitude: 0 })
  assert.deepEqual(c, RI_CENTER)
})

test('ignores coordinates when statewide is chosen explicitly', () => {
  assert.deepEqual(resolveBias({ bias: 'statewide', ...MEMBER }),
    { circle: { center: RI_CENTER, radius: 50000 } })
})

// Null, not an empty circle: searchPlaces omits locationBias entirely rather
// than sending a null value, which Google would reject.
test('sends no circle at all for bias none', () => {
  assert.equal(resolveBias({ bias: 'none' }), null)
  assert.equal(resolveBias({ bias: 'none', ...MEMBER }), null)
})

// Google caps a bias circle at 50 km, so the centre is the only lever and it
// has to reach the whole service area. Barrington (41.72, -71.30), the first
// centre used, left Westerly (184 members, the CT-border test case) 58 km out
// — outside the circle. Guard the measured replacement.
test('the statewide centre reaches the far corners of the service area', () => {
  const km = (aLat, aLon, bLat, bLon) => {
    const R = 6371
    const rad = (d) => (d * Math.PI) / 180
    const dLat = rad(bLat - aLat)
    const dLon = rad(bLon - aLon)
    const h = Math.sin(dLat / 2) ** 2 +
      Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLon / 2) ** 2
    return 2 * R * Math.asin(Math.sqrt(h))
  }
  const corners = {
    Westerly: [41.3776, -71.8273],
    Pawcatuck: [41.3776, -71.8590],
    Woonsocket: [42.0029, -71.5147],
    Newport: [41.4901, -71.3128],
    Providence: [41.8240, -71.4128],
    Seekonk: [41.8073, -71.3395]
  }
  for (const [name, [lat, lon]] of Object.entries(corners)) {
    const d = km(RI_CENTER.latitude, RI_CENTER.longitude, lat, lon)
    assert.ok(d < 50, `${name} is ${d.toFixed(1)} km from the statewide centre, outside the 50 km circle`)
  }
})
