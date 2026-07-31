// Renders pies off-screen purely to capture them for the PDF, then throws them
// away. Deliberately does NOT reuse the on-screen charts: <Tabs lazy> means
// unvisited panels never mount, so there is nothing there to snapshot.
//
// createChart/createCanvas are injected so tests can run without a canvas —
// jsdom has none.

const EXPORT_SIZE = 560 // 280 CSS px at 2x, so the raster holds up in print

// animation:false is LOAD-BEARING. With it, Chart.js draws synchronously during
// construction and toDataURL() on the next line returns a finished pie — no
// await, no nextTick, no requestAnimationFrame. Set any other value here and
// captures silently become half-swept pies.
//
// Frozen because this is the canonical template, shared by every capture and
// pinned by tests below. chartConfig() must NOT hand this object to Chart.js
// directly — see the clone comment there for why.
export const EXPORT_CHART_OPTIONS = Object.freeze({
  responsive: false,
  maintainAspectRatio: false,
  animation: false,
  // The PDF draws its own legend table, so the chart's is off — matching the
  // on-screen MetricsPieCard.
  plugins: { legend: { display: false } },
})

export function chartConfig (slices) {
  return {
    type: 'pie',
    data: {
      labels: slices.map(s => s.label),
      datasets: [{
        data: slices.map(s => s.value),
        backgroundColor: slices.map(s => s.color),
      }],
    },
    // Shallow clone, not the frozen object itself: Chart.js's initConfig()
    // writes options.plugins / options.scales in place during `new Chart()`,
    // before any canvas context is acquired. Handing it the frozen template
    // makes that write throw ("Cannot assign to read only property") in
    // strict mode, which is every module here — killing every PDF export.
    options: { ...EXPORT_CHART_OPTIONS },
  }
}

// Returns null for an empty pie: a blank square in the PDF would read as a bug,
// and the caller prints the empty message instead.
export function capturePie (slices, deps) {
  if (!slices || slices.length === 0) return null

  const { createCanvas, createChart, size = EXPORT_SIZE } = deps
  const canvas = createCanvas(size)
  const chart = createChart(canvas, chartConfig(slices))
  const url = canvas.toDataURL('image/png')
  chart.destroy()
  return url
}

export function captureAll (pies, deps) {
  const out = {}
  for (const [name, slices] of Object.entries(pies)) {
    out[name] = capturePie(slices, deps)
  }
  return out
}
