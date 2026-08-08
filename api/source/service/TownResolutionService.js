'use strict'

const retry = require('async-retry')
const { fetch } = require('undici')
const logger = require('../utils/logger')
const { safeReadBody } = require('../utils/safeReadBody')

// The Census geocoder is a public, unauthenticated federal service. Its URL is
// not configuration — see controllers/OAuth.js, which hardcodes the Google
// token endpoint while config holds only credentials.
const CENSUS_URL = 'https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress'
const TIMEOUT_MS = 10000
const UNRESOLVED = { town: null }

// Pure. Given a Census geographies response, decide what to store.
//
// Reads BASENAME, Census's own name-without-type field. The sibling NAME
// carries a type suffix ('South Kingstown town', 'Providence city',
// 'Roberts district'), and stripping it with a regex means guessing at
// Census's naming grammar.
//
// A town is stored only when every candidate match agrees on it. Census
// fuzzy-matches street names, so a single confident-looking match can be a
// different street; when candidates disagree the address sits on or near a
// municipal line and we refuse to guess rather than direct a member to the
// wrong municipality's services.
function interpretGeocoderResponse (json) {
  const matches = json?.result?.addressMatches
  if (!Array.isArray(matches) || matches.length === 0) return { ...UNRESOLVED }

  const names = new Set()
  for (const m of matches) {
    const subs = m?.geographies?.['County Subdivisions']
    if (Array.isArray(subs) && subs.length > 0) names.add(subs[0]?.BASENAME)
  }
  if (names.size !== 1) return { ...UNRESOLVED }

  const town = [...names][0]
  return typeof town === 'string' && town.trim() ? { town } : { ...UNRESOLVED }
}

function buildUrl ({ street, city, state, zip }) {
  const params = new URLSearchParams({
    address: `${street}, ${city}, ${state} ${zip}`,
    benchmark: 'Public_AR_Current',
    vintage: 'Current_Current',
    layers: 'County Subdivisions',
    format: 'json'
  })
  return `${CENSUS_URL}?${params}`
}

// Resolve one address. Never throws: any failure — transport error or an
// unusable address — resolves to { town: null } so a caller can retry later
// or a coordinator can set the town by hand.
//
// Note there is deliberately NO guard on state. Members just over the CT/MA
// line are served by the Villages and their towns are useful; the catalog is
// what filters irrelevant results.
async function resolveTown ({ street, city, state, zip }) {
  if (!street?.trim() || !zip?.trim()) return { ...UNRESOLVED }

  try {
    const json = await retry(async (bail) => {
      const res = await fetch(buildUrl({ street, city, state, zip }), {
        signal: AbortSignal.timeout(TIMEOUT_MS)
      })
      if (!res.ok) {
        const text = await safeReadBody(res)
        const error = new Error(`Census geocoder returned ${res.status}: ${text}`)
        error.status = res.status
        // 4xx (except 429, rate-limited) means the request itself is bad —
        // a malformed address, for example — and retrying cannot help.
        // 5xx, network errors, and timeouts can plausibly succeed on retry.
        if (res.status >= 400 && res.status < 500 && res.status !== 429) {
          bail(error)
          return
        }
        throw error
      }
      return res.json()
    }, { retries: 2, minTimeout: 500 })

    return interpretGeocoderResponse(json)
  }
  catch (err) {
    logger.writeError('resolveTown', 'towns', { message: err.message, status: err.status })
    return { ...UNRESOLVED }
  }
}

module.exports = { interpretGeocoderResponse, resolveTown }
