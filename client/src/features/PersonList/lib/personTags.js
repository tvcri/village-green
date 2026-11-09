// Tag logic for the Hub persons list: one source for the row tags, the
// filter match, and the sentence that describes a filter selection.
// Tag keys: 'member:<shown>', 'volunteer:<shown>', 'donor', 'circle:<circleId>'.
// 'donor' is the row's key; the picker offers it as the four selectable
// window keys in DONOR_WINDOWS, which match on the row's last gift date.
import { pauseTag } from '../../../shared/lib/volunteerPause.js'
import { civilYearsAgo } from '../../../shared/lib/civilDate.js'

export const DONOR_WINDOWS = [
  { key: 'donor:1y', years: 1, caption: '1 yr' },
  { key: 'donor:2y', years: 2, caption: '2 yr' },
  { key: 'donor:5y', years: 5, caption: '5 yr' },
  { key: 'donor:any', years: null, caption: 'any time' }
]
const windowByKey = new Map(DONOR_WINDOWS.map(w => [w.key, w]))

// A deceased person is shown as dropped in every role they hold.
export function shownStatus (status, deceased) {
  if (status == null) return null
  return deceased ? 'dropped' : status.toLowerCase()
}

// 'Circle of Pride' -> 'Pride', "Veteran's Circle" -> 'Veteran'. Never empty.
export function circleShortName (name) {
  const short = name
    .replace(/^Circle of\s+/i, '')
    .replace(/\s+Circle$/i, '')
    .replace(/['’]s$/, '')
    .trim()
  return short || name
}

export function rowTagKeys (row) {
  const keys = []
  const member = shownStatus(row.memberStatus, row.deceased)
  if (member) keys.push(`member:${member}`)
  const volunteer = shownStatus(row.volunteerStatus, row.deceased)
  if (volunteer) keys.push(`volunteer:${volunteer}`)
  if (row.donor) keys.push('donor')
  for (const circle of row.circles ?? []) keys.push(`circle:${circle.circleId}`)
  return keys
}

// An empty selection matches every row. A donor window key matches a donor
// row whose last gift is inside the window; a null gift fails every year
// window but passes 'any time'. Every other key matches by inclusion.
export function matchesTags (keys, selected, mode, { lastGiftDate = null, today = null } = {}) {
  if (selected.length === 0) return true
  const hit = (k) => {
    const w = windowByKey.get(k)
    if (!w) return keys.includes(k)
    if (!keys.includes('donor')) return false
    if (w.years == null) return true
    return lastGiftDate != null && lastGiftDate >= civilYearsAgo(today, w.years)
  }
  if (mode === 'any') return selected.some(hit)
  if (mode === 'all') return selected.every(hit)
  return keys.length === selected.length && selected.every(hit)
}

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1)

export function tagLabel (key, circleNameById) {
  const [kind, value] = key.split(':')
  if (kind === 'circle') return circleNameById.get(value) ?? `Circle ${value}`
  if (kind === 'donor') return 'Donor'
  return `${capitalize(kind)}, ${value}`
}

// '' for any time, ' (last gift within 5 years)' otherwise.
function donorWindowSuffix (key) {
  const years = windowByKey.get(key)?.years
  if (years == null) return ''
  return ` (last gift within ${years} ${years === 1 ? 'year' : 'years'})`
}

function tagPhrase (key, circleNameById) {
  const [kind, value] = key.split(':')
  if (kind === 'donor') return `a donor${donorWindowSuffix(key)}`
  if (kind === 'circle') return `in ${tagLabel(key, circleNameById)}`
  return `${value === 'active' ? 'an' : 'a'} ${value} ${kind}`
}

// 'active member' / full circle name, for the exact-mode sentence.
function bareLabel (key, circleNameById) {
  const [kind, value] = key.split(':')
  if (kind === 'donor') return `donor${donorWindowSuffix(key)}`
  return kind === 'circle' ? tagLabel(key, circleNameById) : `${value} ${kind}`
}

export function selectionSentence (selected, mode, circleNameById) {
  if (selected.length === 0) return ''
  if (mode === 'exact') {
    return `People whose tags are exactly: ${selected.map(k => bareLabel(k, circleNameById)).join(', ')}`
  }
  const joiner = mode === 'all' ? 'and' : 'or'
  const phrases = selected.map(k => tagPhrase(k, circleNameById))
  const body = phrases.length === 1
    ? phrases[0]
    : `${phrases.slice(0, -1).join(', ')} ${joiner} ${phrases[phrases.length - 1]}`
  return `People who are ${body}`
}

export function isEmailPaused (row, today) {
  return shownStatus(row.volunteerStatus, row.deceased) === 'active' &&
    pauseTag(row.volunteerPause, today) !== null
}
