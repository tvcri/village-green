// Wall-clock time/date helpers. Times are 'HH:MM:SS' civil-time strings and
// serviceDate is a 'YYYY-MM-DD' calendar string — neither is an instant.
// NEVER pass these strings to new Date(): 'YYYY-MM-DD' parses as UTC
// midnight (off-by-one day in western zones) and 'HH:MM:SS' is invalid.

export function minutesToTimeString (mins) {
  if (mins == null) return null
  const h = String(Math.floor(mins / 60)).padStart(2, '0')
  const m = String(mins % 60).padStart(2, '0')
  return `${h}:${m}:00`
}

export function timeStringToMinutes (t) {
  if (!t) return null
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

export function timeStringToLabel (t) {
  const mins = timeStringToMinutes(t)
  if (mins == null) return null
  const h24 = Math.floor(mins / 60)
  const m = mins % 60
  const period = h24 < 12 ? 'AM' : 'PM'
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h12}:${String(m).padStart(2, '0')} ${period}`
}

export function dateToServiceDate (d) {
  if (!d) return null
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function serviceDateToDate (s) {
  if (!s) return null
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

// Sort key that groups by serviceDate and orders within a date by startTime.
// Both parts are fixed-width strings, so plain string comparison is enough --
// no Date construction, per the wall-clock rule above. Only the five 'Ride: *'
// services carry times; everything else has a null startTime and sorts after
// the timed rows in its date group via a '99:99:99' sentinel. The sentinel is
// digits on purpose: a punctuation marker like '~' sorts AFTER digits by ASCII
// codepoint but BEFORE them under localeCompare collation, which would order
// the DataTable and the mobile cards differently. Note untimed rows move to
// the front of their group under a descending sort, which reverses the key
// whole.
export function serviceDateTimeSortKey (row) {
  const date = row?.serviceDate ?? ''
  const time = row?.startTime ?? '99:99:99'
  return `${date} ${time}`
}

export function formatServiceDate (s, { weekday = false } = {}) {
  const d = serviceDateToDate(s)
  if (!d) return ''
  return d.toLocaleDateString('en-US', {
    ...(weekday && { weekday: 'short' }),
    month: 'short', day: 'numeric', year: 'numeric'
  })
}
