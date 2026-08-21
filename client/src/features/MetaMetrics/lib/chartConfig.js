import { STATUS_SERIES } from './reduceCells.js'

// Chart height is computed from the DATA and nothing else. Village Metrics'
// two-way flex stretch — chart matches the legend beside it — does not
// transfer: there, chart rows and legend rows are the same list, but here the
// SERIES count differs per tab (3 outcomes, 4 categories, 1 stacked), so the
// chart's natural height diverges from the table's fixed row count.
//
// Exported and pure so the deferred PDF export can call it with its own
// thickness. A capture canvas whose proportions differ from the PDF's draw box
// gets stretched by pdf-lib — sharing this formula is what prevents that.
export const BAR_THICKNESS = 14
export const CHART_PADDING = 64
const MIN_CHART_HEIGHT = 240

export function chartHeight (rowCount, seriesCount) {
  return Math.max(MIN_CHART_HEIGHT, rowCount * seriesCount * BAR_THICKNESS + CHART_PADDING)
}

const hue = (s, dark) => (dark ? s.colorDark : s.colorLight)

export function buildBarData (rows, labelKey, { dark, series = STATUS_SERIES }) {
  return {
    labels: rows.map(r => r[labelKey]),
    datasets: series.map(s => ({
      label: s.label,
      data: rows.map(r => r[s.key]),
      backgroundColor: hue(s, dark),
      borderRadius: 4,
      borderSkipped: false,
    })),
  }
}

export function buildProportionalData (rows, labelKey, { dark, series = STATUS_SERIES }) {
  return {
    labels: rows.map(r => r[labelKey]),
    datasets: series.map(s => ({
      label: s.label,
      // A village with no requests in range yields 0, not NaN — it must still
      // render as an empty row rather than disappearing.
      data: rows.map(r => (r.total === 0 ? 0 : (r[s.key] / r.total) * 100)),
      backgroundColor: hue(s, dark),
      borderRadius: 4,
      borderSkipped: false,
    })),
  }
}

export function barOptions ({ stacked, percent }) {
  return {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top' },
      tooltip: {
        callbacks: {
          label: (ctx) => percent
            ? `${ctx.dataset.label}: ${Math.round(ctx.parsed.x)}%`
            : `${ctx.dataset.label}: ${ctx.parsed.x}`,
        },
      },
    },
    scales: {
      x: { stacked, beginAtZero: true, ...(percent ? { max: 100 } : {}) },
      y: { stacked },
    },
  }
}
