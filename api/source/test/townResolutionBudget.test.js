'use strict'
const test = require('node:test')
const assert = require('node:assert')
const undici = require('undici')

// The service destructures fetch from undici at load, so the stand-in has to
// be in place before it is required. Its URL is a hardcoded constant.
const realFetch = undici.fetch
let censusFetch
let attempts = 0
undici.fetch = (url, options) => { attempts++; return censusFetch(url, options) }
const { resolveTown } = require('../service/TownResolutionService')
test.after(() => { undici.fetch = realFetch })
test.beforeEach(() => { attempts = 0 })

const ADDRESS = { street: '1 Main St', city: 'Barrington', state: 'RI', zip: '02806' }
const UNRESOLVED = { town: null, latitude: null, longitude: null }
const ANSWER = {
  result: {
    addressMatches: [{
      coordinates: { x: -71.3, y: 41.7 },
      geographies: { 'County Subdivisions': [{ BASENAME: 'Barrington' }] }
    }]
  }
}
const ok = () => ({ ok: true, status: 200, json: async () => ANSWER })
const unavailable = () => ({ ok: false, status: 503, text: async () => 'unavailable', headers: new Headers() })
const hang = (_, { signal }) => new Promise((_, reject) => {
  signal.addEventListener('abort', () => reject(signal.reason))
})

test('gives up on an unresponsive Census within the five second budget', async () => {
  censusFetch = hang
  const started = Date.now()
  const result = await resolveTown(ADDRESS)
  const elapsed = Date.now() - started
  assert.deepEqual(result, UNRESOLVED)
  assert.ok(elapsed >= 4900 && elapsed < 6000, `took ${elapsed}ms`)
  assert.equal(attempts, 1)
})

test('still retries a quick failure inside the budget', async () => {
  censusFetch = () => attempts === 1 ? unavailable() : ok()
  const result = await resolveTown(ADDRESS)
  assert.equal(result.town, 'Barrington')
  assert.equal(attempts, 2)
})

test('does not retry an address Census rejects', async () => {
  censusFetch = () => ({ ok: false, status: 400, text: async () => 'bad address', headers: new Headers() })
  assert.deepEqual(await resolveTown(ADDRESS), UNRESOLVED)
  assert.equal(attempts, 1)
})
