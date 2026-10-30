// Tag logic for the Hub persons list: one source for the row tags, the
// filter match, and the sentence that describes a filter selection.
// Tag keys: 'member:<shown>', 'volunteer:<shown>', 'circle:<circleId>'.
import { pauseTag } from '../../../shared/lib/volunteerPause.js'

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
  for (const circle of row.circles ?? []) keys.push(`circle:${circle.circleId}`)
  return keys
}

// An empty selection matches every row.
export function matchesTags (keys, selected, mode) {
  if (selected.length === 0) return true
  if (mode === 'any') return selected.some(k => keys.includes(k))
  if (mode === 'all') return selected.every(k => keys.includes(k))
  return keys.length === selected.length && selected.every(k => keys.includes(k))
}

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1)

export function tagLabel (key, circleNameById) {
  const [kind, value] = key.split(':')
  if (kind === 'circle') return circleNameById.get(value) ?? `Circle ${value}`
  return `${capitalize(kind)}, ${value}`
}

function tagPhrase (key, circleNameById) {
  const [kind, value] = key.split(':')
  if (kind === 'circle') return `in ${tagLabel(key, circleNameById)}`
  return `${value === 'active' ? 'an' : 'a'} ${value} ${kind}`
}

// 'active member' / full circle name, for the exact-mode sentence.
function bareLabel (key, circleNameById) {
  const [kind, value] = key.split(':')
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
