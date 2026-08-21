// The table beside/below the chart IS the legend — Chart.js's own legend is
// disabled, exactly as in VillageMetrics' MetricsChartCard.vue. But where that
// table is one row per slice (its chart is single-series), Meta's chart is
// villages x series, so this table is a MATRIX: villages down, series across.
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
export function matrixColumns (series, view) {
  return [
    { header: 'Village', key: 'villageName' },
    ...series.map(s => ({ header: s.label, key: s.key })),
    { header: view === 'share' ? 'Requests' : 'Total', key: 'total' },
  ]
}

export function matrixCells (rows, series, view) {
  return rows.map(row => {
    const cells = { villageId: row.villageId, villageName: row.villageName, total: row.total }
    for (const s of series) {
      cells[s.key] = view === 'share' ? pct(row[s.key], row.total) : row[s.key]
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

  const foot = { villageName: view === 'share' ? 'Hub' : 'Total', total: totals.total }
  for (const s of series) {
    foot[s.key] = view === 'share' ? pct(totals[s.key], totals.total) : totals[s.key]
  }
  return foot
}

// State is in the filename because it is baked into the contents — mirroring
// csvFilename() in VillageMetrics' metricsCsv.js. Without it, a counts and a
// share download of the same tab collide as one name in Downloads.
export function metaCsvFilename ({ tab, view, start, end }) {
  return ['meta', tab, view, start, end].filter(Boolean).join('-') + '.csv'
}
