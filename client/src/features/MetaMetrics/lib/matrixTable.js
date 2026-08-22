// The columns of the Outcomes table. There is no chart on this page — the bars
// are drawn IN these rows (see barGeometry.js), so this is not a legend beside
// a chart but the whole visualisation: a MATRIX of villages down, series
// across, with each row's bar rendered alongside its own figures.
//
// Pure and DOM-free: the deferred PDF export draws its own table from these
// same values.

// Share view shows one decimal because the bar cannot: "22.8% unmatched", not
// "about a quarter".
function pct (value, total) {
  return `${(total === 0 ? 0 : (value / total) * 100).toFixed(1)}%`
}

// The last column changes meaning with the view. In share view it stays an
// ABSOLUTE count — it is the answer to "share hides magnitude", letting a
// reader see that a 45.6% completion rate is out of only 193 requests.
// `full: true` keeps the long labels — used for the CSV, where a header has no
// column width to fit into. On screen a series may supply a `shortLabel`
// ("Home Help" -> "Home") so the header row does not wrap to two lines while
// its neighbours sit on one. The full label still names the bar segment in its
// tooltip and the column in the export.
export function matrixColumns (series, view, { full = false } = {}) {
  return [
    { header: 'Village', key: 'villageName' },
    ...series.map(s => ({ header: full ? s.label : (s.shortLabel ?? s.label), key: s.key })),
    { header: view === 'percent' ? 'Requests' : 'Total', key: 'total' },
  ]
}

export function matrixCells (rows, series, view) {
  return rows.map(row => {
    const cells = { villageId: row.villageId, villageName: row.villageName, total: row.total }
    for (const s of series) {
      cells[s.key] = view === 'percent' ? pct(row[s.key], row.total) : row[s.key]
    }
    return cells
  })
}

// A column of percentages does not sum to anything meaningful, so share view
// shows the hub-wide RATE rather than a total, and is labelled accordingly.
export function matrixFooter (rows, series, view) {
  const totals = { total: rows.reduce((sum, r) => sum + r.total, 0) }
  for (const s of series) {
    totals[s.key] = rows.reduce((sum, r) => sum + r[s.key], 0)
  }

  const foot = { villageName: view === 'percent' ? 'Hub' : 'Total', total: totals.total }
  for (const s of series) {
    foot[s.key] = view === 'percent' ? pct(totals[s.key], totals.total) : totals[s.key]
  }
  return foot
}

// State is in the filename because it is baked into the contents — mirroring
// csvFilename() in VillageMetrics' metricsCsv.js. Without it, a counts and a
// share download of the same tab collide as one name in Downloads.
export function metaCsvFilename ({ tab, view, start, end }) {
  return ['meta', tab, view, start, end].filter(Boolean).join('-') + '.csv'
}
