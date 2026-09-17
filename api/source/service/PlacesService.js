'use strict'

const retry = require('async-retry')
const { fetch } = require('undici')
const config = require('../utils/config')
const logger = require('../utils/logger')
const { safeReadBody } = require('../utils/safeReadBody')

// Google Places API (New), Text Search. The URL is not configuration — see
// TownResolutionService, which hardcodes the Census endpoint the same way.
const PLACES_URL = 'https://places.googleapis.com/v1/places:searchText'
const TIMEOUT_MS = 10000
// Google's ceiling for one page of Text Search, and the count the working
// group settled on. Asking for more is not an error — Google silently returns
// 20 — but pin it here so the number is visible rather than implicit.
const RESULT_COUNT = 20

// Every field here is Pro tier. Adding a phone number or opening hours would
// move the whole call to Enterprise (1,000 free/month instead of 5,000).
const FIELD_MASK = 'places.id,places.displayName,places.formattedAddress,places.addressComponents'

// Bias, never restrict: members routinely travel out of town (Seekonk MA is a
// common Stop & Shop). A restriction would bury the right answer.
//
// 50 km is Google's ceiling for a bias circle, so the centre is the only lever
// and it has to be chosen to reach the whole service area. The obvious centre —
// Barrington, where the first version put it — does NOT: Westerly is 58 km out
// and Pawcatuck 58.7, both outside. Westerly is the second-largest village (184
// members) and the CT-border test case. This point, near Coventry, reaches
// everything: Westerly 42.7 km, Pawcatuck 43.1, Woonsocket 33.8, Newport 30.6,
// Providence 17.9, Seekonk 21.2.
const RI_CENTER = { latitude: 41.70, longitude: -71.55 }
const BIAS_RADIUS_M = 50000.0

const circleAround = ({ latitude, longitude }) => ({
  circle: { center: { latitude, longitude }, radius: BIAS_RADIUS_M }
})

// Which circle, if any, to send. Three coordinator-chosen modes:
//
//   'member'    — centre on the member's home. The default, and the reason this
//                 exists: a fixed statewide centre measurably steered results
//                 toward the towns near it.
//   'statewide' — the RI_CENTER circle. Also the fallback whenever 'member' is
//                 asked for without usable coordinates.
//
// A third mode, 'none' (send no locationBias, letting Google bias on the
// CALLER's IP), was removed from the OAS enum once the client's bias droplist
// went: in production the caller is an Azure App Service address in northern
// Virginia, and it only ever looked harmless locally because the dev machine
// egresses from RI. The validator now rejects it, so there is no branch for it.
function resolveBias ({ bias, latitude, longitude }) {
  if (bias !== 'statewide') {
    // Number(null) is 0 — a real coordinate in the Gulf of Guinea — and null
    // is exactly what a failed geocode sends, so reject it before converting
    // rather than centring the circle off the coast of Africa.
    const lat = latitude === null || latitude === undefined || latitude === '' ? NaN : Number(latitude)
    const lon = longitude === null || longitude === undefined || longitude === '' ? NaN : Number(longitude)
    if (Number.isFinite(lat) && Number.isFinite(lon)) return circleAround({ latitude: lat, longitude: lon })
  }
  return circleAround(RI_CENTER)
}

// A subpremise that already names its kind, so no "Suite " prefix is added.
const SUBPREMISE_DESIGNATOR = /^(?:#|(?:suite|ste|unit|apt|apartment|bldg|building|fl|floor|rm|room)\b)/i

// Pure. Flatten one Place's addressComponents onto the service_request
// address columns. Google returns the suite as a bare `subpremise` ("A2");
// stored data carries "Suite A2", so that convention is applied here.
// `route.longText` is used deliberately — it spells out "Avenue", which is
// what the imported records contain.
//
// Some RI addresses carry the municipality in `sublocality` or
// `administrative_area_level_3` rather than `locality`; the same class of
// problem TownResolutionService handles with Census BASENAME.
function interpretPlacesResponse (json) {
  const places = json?.places
  if (!Array.isArray(places)) return []

  return places.map((p) => {
    const byType = new Map()
    for (const c of p?.addressComponents ?? []) {
      for (const t of c?.types ?? []) if (!byType.has(t)) byType.set(t, c)
    }
    const long = (t) => byType.get(t)?.longText ?? ''
    const short = (t) => byType.get(t)?.shortText ?? ''

    const street = [long('street_number'), long('route')].filter(Boolean).join(' ')
    const suite = long('subpremise')
    // "A2" gets the stored-data convention "Suite A2"; "Unit A", "Ste 105",
    // "#2" already say what they are and are kept verbatim.
    const suiteText = suite && !SUBPREMISE_DESIGNATOR.test(suite) ? `Suite ${suite}` : suite
    const address = suiteText ? `${street}, ${suiteText}` : street

    return {
      placeId: p?.id ?? '',
      name: p?.displayName?.text ?? '',
      formattedAddress: p?.formattedAddress ?? '',
      address,
      city: long('locality') || long('sublocality') || long('administrative_area_level_3'),
      state: short('administrative_area_level_1'),
      zip: long('postal_code')
    }
  })
}

// The town and state are appended to the text rather than passed as a
// structured bias because a plain "CVS" returns eight stores and
// "CVS, Barrington, RI" returns one — the coordinator types the name, VG
// supplies the rest.
//
// The state is not optional in practice: Google resolves a bare town name
// lexically, and "Hopkinton" means Massachusetts unless told otherwise
// (verified live 2026-09-08 — town-only returned eight MA results, town +
// state returned the one RI clinic). The bias circle cannot override text.
// Appending the state does not suppress cross-border results; Seekonk MA
// still surfaces for "Stop & Shop, Barrington, RI".
function buildQuery ({ text, town, state }) {
  return [text, town, state].map((s) => (s ?? '').trim()).filter(Boolean).join(', ')
}

// Circuit breaker on a runaway caller, NOT a fairness limiter. Every call here
// is billed against the Places Pro free tier (5,000/month), and a loop — a
// retry storm, a re-render, a script pointed at the wrong host — can spend the
// month in minutes. The ceiling is far above what a coordinator produces (a
// busy hour is tens of lookups) and far below what a loop does.
//
// Deliberately in-process and NOT persisted. A monthly counter would have to
// survive restarts to mean anything, and here merge IS deploy — the container
// restarts on every squash-merge to main, which would zero it far more often
// than the quota it claims to track. A runaway does its damage inside one
// container lifetime, so a per-minute window is the scope that actually
// matches the failure. The slow leak (sustained calls just under the ceiling)
// is knowingly not covered; the backstop for that is the Cloud console quota
// cap, noted with the referrer comment below.
const MAX_CALLS_PER_MINUTE = 60
let windowStart = 0
let windowCount = 0

function withinRate (now = Date.now()) {
  if (now - windowStart >= 60000) {
    windowStart = now
    windowCount = 0
  }
  if (windowCount >= MAX_CALLS_PER_MINUTE) return false
  windowCount++
  return true
}

// Test seam: the breaker is module state, so a test that trips it would leak
// into the next one.
function resetRateWindow () {
  windowStart = 0
  windowCount = 0
}

// Search for places. Never throws: any failure — transport error, a bad key,
// or a Google-side problem — resolves to [] so the dialog shows "no matches"
// rather than the global error modal.
async function searchPlaces ({ text, town, state, bias, latitude, longitude }) {
  if (!text?.trim()) return []

  // Returns [] like every other failure here, so no caller changes. The log is
  // the point: without it, tripping the breaker is indistinguishable from
  // Google not knowing the place.
  if (!withinRate()) {
    logger.writeError('searchPlaces', 'rateLimited', { limit: MAX_CALLS_PER_MINUTE, windowStart })
    return []
  }

  const headers = {
    'Content-Type': 'application/json',
    'X-Goog-Api-Key': config.google.mapsKey,
    'X-Goog-FieldMask': FIELD_MASK
  }
  // The Maps key is HTTP-referrer-restricted for the browser embeds, and a
  // server-side call carries no referrer, so we set one.
  //
  // This is deliberate, not a stopgap. An IP-restricted key is impractical
  // here: on Azure App Service the outbound pool changes when the app scales
  // or moves, and through ngrok the egress address is a dynamic home IP —
  // ngrok's published ranges are inbound only. Either way a rotated address
  // fails as a 403, which this service turns into "no matches" — a silent
  // break.
  //
  // A referrer restriction is advisory in any case (the caller sets the
  // header), and this key already ships to browsers via VG.Env for the map
  // embeds. The controls that actually bound the risk are the key's API
  // restrictions and a Cloud console quota cap, not the referrer.
  if (config.google.placesReferer) headers.Referer = config.google.placesReferer

  const locationBias = resolveBias({ bias, latitude, longitude })
  const body = JSON.stringify({
    textQuery: buildQuery({ text, town, state }),
    maxResultCount: RESULT_COUNT,
    // resolveBias always returns a circle now, but the guard costs nothing and
    // keeps sending an explicit null impossible.
    ...(locationBias ? { locationBias } : {})
  })

  try {
    const json = await retry(async (bail) => {
      const res = await fetch(PLACES_URL, { method: 'POST', headers, body, signal: AbortSignal.timeout(TIMEOUT_MS) })
      if (!res.ok) {
        const text = await safeReadBody(res)
        const error = new Error(`Places API returned ${res.status}: ${text}`)
        error.status = res.status
        // 4xx (except 429) means the request itself is bad — a rejected key,
        // a malformed body — and retrying cannot help.
        if (res.status >= 400 && res.status < 500 && res.status !== 429) {
          bail(error)
          return
        }
        throw error
      }
      return res.json()
    }, { retries: 2, minTimeout: 500 })

    return interpretPlacesResponse(json)
  }
  catch (err) {
    logger.writeError('searchPlaces', 'places', { message: err.message, status: err.status })
    return []
  }
}

module.exports = { interpretPlacesResponse, buildQuery, resolveBias, searchPlaces, withinRate, resetRateWindow, RI_CENTER, MAX_CALLS_PER_MINUTE }
