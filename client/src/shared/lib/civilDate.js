// Civil calendar-date helpers. serviceDate is a 'YYYY-MM-DD' calendar string,
// NOT an instant. NEVER pass it to new Date(): 'YYYY-MM-DD' parses as UTC
// midnight (off-by-one day in western zones). Use the numeric Date constructor
// (local, no string parsing / tz conversion) instead.

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

// Today as a civil 'YYYY-MM-DD' string in the viewer's local zone. Not
// toISOString(): an evening entry west of UTC would render as tomorrow.
export function todayCivilDate () {
  return dateToServiceDate(new Date())
}
