
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

export const PRESET_KEYS = ['thisYear', 'lastYear', 'last90', 'last30']

export const PRESET_LABELS = {
  thisYear: 'This year',
  lastYear: 'Last year',
  last90: 'Last 90 days',
  last30: 'Last 30 days',
}

// Narrow-viewport labels. Only the two "days" presets are shortened — dropping
// the redundant "Last " prefix is enough to fit four buttons on one phone row,
// and the year labels read better in full. Same keys, same behaviour, display
// only; PRESET_LABELS_SHORT must stay key-for-key with PRESET_KEYS.
export const PRESET_LABELS_SHORT = {
  thisYear: 'This year',
  lastYear: 'Last year',
  last90: '90 days',
  last30: '30 days',
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
    default:
      return null
  }
}

// Returns the matching preset key, or null when the range is arbitrary. null
// means "no preset is active" and renders as no button highlighted — there is
// no 'custom' pseudo-preset, because a range that matches nothing is the
// ABSENCE of a preset rather than a fifth kind of one. The date fields below
// carry the state in that case.
export function matchPreset (range, todayCivil) {
  for (const key of PRESET_KEYS) {
    const r = presetRange(key, todayCivil)
    if (r && r.start === range?.start && r.end === range?.end) return key
  }
  return null
}

export function isValidRange (range) {
  if (!range) return false
  const { start, end } = range
  if (!CIVIL_RE.test(start) || !CIVIL_RE.test(end)) return false
  return start <= end // lexicographic == chronological for YYYY-MM-DD
}
