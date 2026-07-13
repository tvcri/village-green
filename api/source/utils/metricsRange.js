'use strict'
const SmError = require('./error')

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

module.exports = { resolveMetricsRange }
