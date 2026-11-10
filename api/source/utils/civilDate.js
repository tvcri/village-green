'use strict'

// Civil (wall-clock) date arithmetic on YYYY-MM-DD strings. Deliberately no
// Date: a calendar date is not an instant, and building one from a bare
// date string parses as UTC and then shifts with the host's timezone.

const isLeapYear = y => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0

// The same calendar date `years` earlier. Feb 29 in a non-leap target year
// clamps to Feb 28 (not a roll into March), so "within N years" never
// reaches back further than N whole years.
function civilYearsAgo (today, years) {
  const [y, m, d] = today.split('-')
  const target = Number(y) - years
  const day = (m === '02' && d === '29' && !isLeapYear(target)) ? '28' : d
  return `${String(target).padStart(4, '0')}-${m}-${day}`
}

module.exports = { civilYearsAgo }
