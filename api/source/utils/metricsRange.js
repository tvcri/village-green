'use strict'
const SmError = require('./error')

// Today's civil date (YYYY-MM-DD) in the given IANA timezone. 'en-CA' formats
// as YYYY-MM-DD; the timeZone option resolves the clock in the deployment's
// civil zone rather than the server process's zone, so a UTC container still
// reports the users' local calendar day. This reads the clock only — it does
// not hydrate any stored serviceDate value (wall-clock rule).
function todayCivil(timeZone) {
  return new Date().toLocaleDateString('en-CA', { timeZone })
}

// start/end/today are civil YYYY-MM-DD strings (wall-clock rule: never
// hydrate serviceDate values into JS Dates). Lexicographic comparison is
// correct for this format.
function resolveMetricsRange(start, end, today) {
  const effectiveEnd = end ?? today
  if (start > effectiveEnd) {
    throw new SmError.ClientError(`start (${start}) must not be after end (${effectiveEnd})`)
  }
  return { start, end: effectiveEnd }
}

module.exports = { resolveMetricsRange, todayCivil }
