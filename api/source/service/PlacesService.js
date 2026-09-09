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
const DEFAULT_RESULTS = 8
// Google's ceiling for one page of Text Search. Asking for more is not an
// error — it silently returns 20 — so clamp here, where the limit is visible.
const GOOGLE_MAX_RESULTS = 20

// Every field here is Pro tier. Adding a phone number or opening hours would
// move the whole call to Enterprise (1,000 free/month instead of 5,000).
const FIELD_MASK = 'places.id,places.displayName,places.formattedAddress,places.addressComponents'

// Bias, never restrict: members routinely travel out of town (Seekonk MA is a
// common Stop & Shop). A restriction would bury the right answer.
const RI_BIAS = { circle: { center: { latitude: 41.72, longitude: -71.30 }, radius: 50000.0 } }

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
// DEMO-ONLY. Exposed so the working group can vary the result count live while
// we learn what a useful list looks like. Remove this, the `maxResults` request
// field, and the dialog's input together when the count is settled.
function clampResultCount (n) {
  // Guard null explicitly: Number(null) is 0, which would clamp to a
  // one-result search rather than falling back to the default.
  if (n === null || n === undefined || n === '') return DEFAULT_RESULTS
  const v = Math.floor(Number(n))
  if (!Number.isFinite(v)) return DEFAULT_RESULTS
  return Math.min(Math.max(v, 1), GOOGLE_MAX_RESULTS)
}

function buildQuery ({ text, town, state }) {
  return [text, town, state].map((s) => (s ?? '').trim()).filter(Boolean).join(', ')
}

// Search for places. Never throws: any failure — transport error, a bad key,
// or a Google-side problem — resolves to [] so the dialog shows "no matches"
// rather than the global error modal.
async function searchPlaces ({ text, town, state, maxResults }) {
  if (!text?.trim()) return []

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

  const body = JSON.stringify({
    textQuery: buildQuery({ text, town, state }),
    maxResultCount: clampResultCount(maxResults),
    locationBias: RI_BIAS
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

module.exports = { interpretPlacesResponse, buildQuery, clampResultCount, searchPlaces }
