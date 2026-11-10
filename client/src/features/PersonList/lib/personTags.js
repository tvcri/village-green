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

// A filter group: one per role ('member', 'volunteer', 'donor') and one per
// picked circle ('circle:3'). Picks inside a role group always OR, since a
// person holds one status per role; Match decides only how groups combine
// (VG-202611-520). Each circle is its own group so "in Pride AND in Veteran"
// stays expressible under All.
function groupOf (key) {
  const kind = key.split(':')[0]
  return kind === 'circle' ? key : kind
}
const isCircle = (k) => k.startsWith('circle:')

// Selected keys bucketed by group, groups in the order first picked.
function groupSelection (selected) {
  const groups = new Map()
  for (const k of selected) {
    const g = groupOf(k)
    if (!groups.has(g)) groups.set(g, [])
    groups.get(g).push(k)
  }
  return groups
}

// An empty selection matches every row. A donor window key matches a donor
// row whose last gift is inside the window; a null gift fails every year
// window but passes 'any time'. Every other key matches by inclusion.
// Exact: the row holds exactly the picked roles, each in a picked status.
// Circles count only when one is picked, and then the row must be in exactly
// the picked circles; with none picked a row's circles are ignored.
export function matchesTags (keys, selected, mode, { lastGiftDate = null, today = null } = {}) {
  if (selected.length === 0) return true
  const hit = (k) => {
    const w = windowByKey.get(k)
    if (!w) return keys.includes(k)
    if (!keys.includes('donor')) return false
    if (w.years == null) return true
    return lastGiftDate != null && lastGiftDate >= civilYearsAgo(today, w.years)
  }
  const groups = [...groupSelection(selected).values()]
  const groupHit = (picks) => picks.some(hit)
  if (mode === 'any') return groups.some(groupHit)
  if (!groups.every(groupHit)) return false
  if (mode === 'all') return true
  const rowRoles = keys.filter(k => !isCircle(k)).map(groupOf)
  const pickedRoles = new Set(selected.filter(k => !isCircle(k)).map(groupOf))
  if (rowRoles.length !== pickedRoles.size) return false
  const pickedCircles = selected.filter(isCircle)
  return pickedCircles.length === 0 || keys.filter(isCircle).length === pickedCircles.length
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

const STATUS_ORDER = ['active', 'pending', 'dropped']

// One group's phrase. A role's statuses share one noun in a fixed order:
// "an active or pending member". The "or" is lowercase because Match does
// not control it.
function groupPhrase (picks, circleNameById, bare) {
  const [kind] = picks[0].split(':')
  if (kind === 'donor') return `${bare ? '' : 'a '}donor${donorWindowSuffix(picks[0])}`
  if (kind === 'circle') return bare ? tagLabel(picks[0], circleNameById) : `in ${tagLabel(picks[0], circleNameById)}`
  const statuses = picks.map(k => k.split(':')[1])
    .sort((a, b) => STATUS_ORDER.indexOf(a) - STATUS_ORDER.indexOf(b))
  const article = bare ? '' : (statuses[0] === 'active' ? 'an ' : 'a ')
  return `${article}${joinList(statuses, 'or')} ${kind}`
}

const joinList = (items, joiner) => items.length === 1
  ? items[0]
  : `${items.slice(0, -1).join(', ')} ${joiner} ${items[items.length - 1]}`

// `also` holds the ticked Also boxes as predicates ('are veterans'). They
// narrow every match mode (an AND outside Any/All/Exactly), so the clause
// follows a comma: "…an active member or a donor, and who are veterans".
// Staff are trained to read this sentence, so it names every tag and box.
// The words Match controls are capitalised (AND / OR / EXACTLY, @csmig
// 2026-11-09): the only difference between Any and All is that one word, so
// it must not be buried. The "or" inside a role group and the Also clause's
// "and" stay lowercase because Match does not change them.
export function selectionSentence (selected, mode, circleNameById, also = []) {
  const alsoClause = also.length ? joinList(also, 'and') : ''
  if (selected.length === 0) return alsoClause ? `People who ${alsoClause}` : ''
  const tail = alsoClause ? `, and who ${alsoClause}` : ''
  const groups = [...groupSelection(selected).values()]
  if (mode === 'exact') {
    return `People whose tags are EXACTLY: ${groups.map(g => groupPhrase(g, circleNameById, true)).join(', ')}${tail}`
  }
  const phrases = groups.map(g => groupPhrase(g, circleNameById, false))
  return `People who are ${joinList(phrases, mode === 'all' ? 'AND' : 'OR')}${tail}`
}

export function isEmailPaused (row, today) {
  return shownStatus(row.volunteerStatus, row.deceased) === 'active' &&
    pauseTag(row.volunteerPause, today) !== null
}
