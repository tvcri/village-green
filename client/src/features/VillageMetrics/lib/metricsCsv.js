// CSV column definitions and filename construction for the Village Metrics
// exports. Pure — no Vue, no DOM. Pairs with shared/lib/csvUtils.js, which
// already handles RFC-4180 quoting.

export const PIE_COLUMNS = [
  { header: 'Label', key: 'label' },
  { header: 'Value', key: 'value' },
  { header: 'Pct', key: 'pct' },
]

// The count tables differ only in what the name column is called.
export function countColumns (nameHeader) {
  return [
    { header: nameHeader, key: 'fullName' },
    { header: 'Completed', key: 'count' },
  ]
}

// pct arrives as a fraction (0..1); the screen shows it rounded to a whole
// percent, so the CSV matches rather than leaking float noise.
export function pieCsvRows (rows) {
  return rows.map(r => ({
    label: r.label,
    value: r.value,
    pct: `${Math.round((r.pct ?? 0) * 100)}%`,
  }))
}

function slug (text) {
  return String(text)
    .toLowerCase()
    .replace(/'/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// State is in the filename because it is baked into the contents: without it,
// four downloads at different filters all land as `categories.csv`.
export function csvFilename ({ villageName, table, state, start, end }) {
  const parts = [slug(villageName || 'village'), table]
  if (state) parts.push(state)
  parts.push(start, end)
  return `${parts.join('-')}.csv`
}
