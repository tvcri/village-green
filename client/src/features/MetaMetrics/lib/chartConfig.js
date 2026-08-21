import { STATUS_SERIES } from './reduceCells.js'

const hue = (s, dark) => (dark ? s.colorDark : s.colorLight)

export function buildBarData (rows, labelKey, { dark }) {
  return {
    labels: rows.map(r => r[labelKey]),
    datasets: STATUS_SERIES.map(s => ({
      label: s.label,
      data: rows.map(r => r[s.key]),
      backgroundColor: hue(s, dark),
      borderRadius: 4,
      borderSkipped: false,
    })),
  }
}

export function buildProportionalData (rows, labelKey, { dark }) {
  return {
    labels: rows.map(r => r[labelKey]),
    datasets: STATUS_SERIES.map(s => ({
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
