// The single ordering of the Outcomes rows. The table header is the sort
// control, and because each row carries its own bar, ordering the rows orders
// the bars — there is no second sequence to keep in step.
//
// Pure and component-free on purpose: the deferred PDF export draws its own
// table and cannot scrape the DOM, so it needs this list as plain data.

export const SERIES_KEYS = ['completed', 'cancelled', 'unmatched']

// Village name ascending, NOT total descending. Alphabetical is the only sort
// that is not itself an editorial claim, and it holds the rows still when the
// date range changes — where a total sort reshuffles every row.
export const DEFAULT_SORT = { sort: 'villageName', dir: 'asc' }

// In share view a series column ranks by its FRACTION of the row, so a village
// with a bad rate but small absolute numbers rises. That is the intent; the
// Requests column beside it is what keeps the reader honest about magnitude.
function valueFor (row, sort, view) {
  if (sort === 'total') return row.total
  if (view === 'share' && SERIES_KEYS.includes(sort)) {
    return row.total === 0 ? 0 : row[sort] / row.total
  }
  return row[sort]
}

export function orderRows (rows, { sort, dir, view }) {
  const key = (sort === 'villageName' || sort === 'total' || SERIES_KEYS.includes(sort))
    ? sort
    : DEFAULT_SORT.sort
  const sign = dir === 'desc' ? -1 : 1

  // Copy first: callers pass a computed array that other consumers also read.
  return [...rows].sort((a, b) => {
    if (key === 'villageName') {
      return sign * a.villageName.localeCompare(b.villageName)
    }
    return sign * (valueFor(a, key, view) - valueFor(b, key, view))
  })
}
