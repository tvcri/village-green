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

// The label on the totals line. Exported so tests and any future caller name it
// rather than re-typing the literal; the screen and the PDF both reach it
// through matrixFooter().
//
// The CSV deliberately does NOT carry the totals line. It is read by a
// spreadsheet, not a person: an aggregate row inside the data breaks sorting,
// skews a pivot, and double-counts under any SUM() over the column. The totals
// line is a presentation device for the two rendered outputs.
export const ALL_VILLAGES_LABEL = 'All Villages'

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

// The totals line. Named `matrixFooter` for its arithmetic, not its position:
// the customer asked for it as the FIRST line of every table, so callers render
// it above the village rows (see MetaMatrixTable.vue and drawSection() in
// metaMetricsPdf.js). It is not part of the sortable body — it stays pinned
// first under every sort key and direction.
//
// A column of percentages does not sum to anything meaningful, so share view
// shows the hub-wide RATE rather than a total. The LABEL is the same either
// way: 'All Villages' names the scope of the line, which does not change with
// the view, where 'Total'/'Hub' described the arithmetic and read as a fourth
// village once the line moved to the top of the table.
export function matrixFooter (rows, series, view) {
  const totals = { total: rows.reduce((sum, r) => sum + r.total, 0) }
  for (const s of series) {
    totals[s.key] = rows.reduce((sum, r) => sum + r[s.key], 0)
  }

  const foot = { villageName: ALL_VILLAGES_LABEL, total: totals.total }
  for (const s of series) {
    foot[s.key] = view === 'percent' ? pct(totals[s.key], totals.total) : totals[s.key]
  }
  return foot
}

// State is in the filename because it is baked into the contents — mirroring
// csvFilename() in VillageMetrics' metricsCsv.js. Without it, a counts and a
// share download of the same tab collide as one name in Downloads.
export function metaCsvFilename ({ tab, view, start, end }) {
  return ['tvcri', tab, view, start, end].filter(Boolean).join('-') + '.csv'
}

// The PDF carries ALL THREE tabs, so it is NOT named for the one that happened
// to be on screen: that produced differently-named files with byte-identical
// contents. `view` stays, because counts and share really are different
// documents; the tab does not, because it is not in the document at all.
export function metaPdfFilename ({ view, start, end }) {
  return ['tvcri-metrics', view, start, end].filter(Boolean).join('-') + '.pdf'
}
