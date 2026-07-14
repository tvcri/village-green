
// Pure civil-date helpers. YYYY-MM-DD strings only. Never new Date(string).
const CIVIL_RE = /^\d{4}-\d{2}-\d{2}$/

function toParts (civil) {
  const [y, m, d] = civil.split('-').map(Number)
  return { y, m, d }
}

function fromDate (dt) {
  const y = dt.getFullYear()
  const m = String(dt.getMonth() + 1).padStart(2, '0')
  const d = String(dt.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function addDaysCivil (civil, delta) {
  const { y, m, d } = toParts(civil)
  // numeric constructor = local, no string parsing / tz conversion
  const dt = new Date(y, m - 1, d + delta)
  return fromDate(dt)
}

export const PRESET_KEYS = ['thisYear', 'lastYear', 'last90', 'last30', 'custom']

export const PRESET_LABELS = {
  thisYear: 'This year',
  lastYear: 'Last year',
  last90: 'Last 90 days',
  last30: 'Last 30 days',
  custom: 'Custom',
}

export function presetRange (key, todayCivil) {
  const { y } = toParts(todayCivil)
  switch (key) {
    case 'thisYear':
      return { start: `${y}-01-01`, end: todayCivil }
    case 'lastYear':
      return { start: `${y - 1}-01-01`, end: `${y - 1}-12-31` }
    case 'last90':
      return { start: addDaysCivil(todayCivil, -89), end: todayCivil }
    case 'last30':
      return { start: addDaysCivil(todayCivil, -29), end: todayCivil }
    case 'custom':
    default:
      return null
  }
}

export function matchPreset (range, todayCivil) {
  for (const key of PRESET_KEYS) {
    if (key === 'custom') continue
    const r = presetRange(key, todayCivil)
    if (r && r.start === range?.start && r.end === range?.end) return key
  }
  return 'custom'
}

export function isValidRange (range) {
  if (!range) return false
  const { start, end } = range
  if (!CIVIL_RE.test(start) || !CIVIL_RE.test(end)) return false
  return start <= end // lexicographic == chronological for YYYY-MM-DD
}
