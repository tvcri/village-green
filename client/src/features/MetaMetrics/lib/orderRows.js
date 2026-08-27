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
function valueFor (row, sort, view, seriesKeys) {
  if (sort === 'total') return row.total
  if (view === 'percent' && seriesKeys.includes(sort)) {
    return row.total === 0 ? 0 : row[sort] / row.total
  }
  return row[sort]
}

// `seriesKeys` defaults to the outcome keys but is supplied by the Categories
// tab, whose columns are the four category names. Hardcoding them would make a
// click on "Rides" fall back to village name while the header arrow still
// pointed at Rides — a sort that silently never happened.
export function orderRows (rows, { sort, dir, view, seriesKeys = SERIES_KEYS }) {
  const valid = sort === 'villageName' || sort === 'total' || seriesKeys.includes(sort)
  const key = valid ? sort : DEFAULT_SORT.sort
  // The DIRECTION falls back with the key. A sort key can be valid on one tab
  // and meaningless on another — 'unmatched' is an Outcomes column, not a
  // Categories one — and the PDF exports every tab under whatever sort the page
  // carries. Keeping 'desc' from the abandoned column would list villages Z-to-A
  // for no reason a reader could see.
  const dirUsed = valid ? dir : DEFAULT_SORT.dir
  const sign = dirUsed === 'desc' ? -1 : 1

  // Copy first: callers pass a computed array that other consumers also read.
  return [...rows].sort((a, b) => {
    if (key === 'villageName') {
      return sign * a.villageName.localeCompare(b.villageName)
    }
    return sign * (valueFor(a, key, view, seriesKeys) - valueFor(b, key, view, seriesKeys))
  })
}
