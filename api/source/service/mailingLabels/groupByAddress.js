'use strict'

// Mailing labels are deduplicated by ADDRESS, not by household. The goal is
// postage: one address, one envelope, one stamp. Whether the people at an
// address are a couple, roommates, or unrelated tenants is irrelevant.
//
// member.primaryPersonId exists and links household members, but it is
// deliberately NOT used — it answers "who lives together", not "how many
// envelopes do we print".
//
// Dev-data note (2026-07-20): staff flag exactly one member per household at
// data entry, so mergedCount is expected to be 0 on real data. This grouping
// is the safety net for when that practice slips.
//
// Normalization is deliberately conservative. The costs are asymmetric:
//   under-merge ("St" vs "Street") -> one extra stamp, visible on the sheet
//   over-merge  ("Apt 2" vs "Apt 4") -> a member silently stops getting mail
// Prefer under-merging. Do not add abbreviation expansion or fuzzy matching
// without an explicit customer decision.

function normalizePart (value) {
  if (value === null || value === undefined) return ''
  return String(value)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.,;:]+$/, '')
}

function normalizeAddress (row) {
  return [row.street, row.unit, row.city, row.state, row.zip]
    .map(normalizePart)
    .join('|')
}

function hasStreet (row) {
  return normalizePart(row.street).length > 0
}

function fullName (row) {
  return [row.firstName, row.lastName, row.suffix].filter(Boolean).join(' ').trim()
}

function byName (a, b) {
  const last = normalizePart(a.lastName).localeCompare(normalizePart(b.lastName))
  return last !== 0
    ? last
    : normalizePart(a.firstName).localeCompare(normalizePart(b.firstName))
}

function composeName (recipients) {
  const sorted = [...recipients].sort(byName)
  if (sorted.length === 0) return ''
  if (sorted.length === 1) return fullName(sorted[0])
  if (sorted.length > 2) return `${fullName(sorted[0])} and others`

  const [first, second] = sorted
  // Compress to "Jane and John Smith" only when neither carries a suffix —
  // "Jane and John Smith Jr." would hand Jane the suffix.
  const sameSurname = normalizePart(first.lastName) === normalizePart(second.lastName)
    && normalizePart(first.lastName).length > 0
    && !first.suffix && !second.suffix
  return sameSurname
    ? `${first.firstName} and ${second.firstName} ${second.lastName}`
    : `${fullName(first)} and ${fullName(second)}`
}

// Salutations: the names a letter for this envelope greets, in three forms,
// for a Word mail merge. Names only, never "Dear" or the trailing comma —
// the greeting wording belongs to the letter template. Unlike the label line
// they name everyone (a greeting cannot say "and others"), in the same byName
// order as composeName so a letter reads in the same order as its envelope.
//
// Some first names carry a nickname typed in parentheses ("Anne (Nancy)").
// It is removed everywhere and, when the nickname column is empty, used as
// the nickname.
const PAREN_NICKNAME = /\s*\(([^)]*)\)/

function givenName (row) {
  return (row.firstName ?? '').replace(PAREN_NICKNAME, '').trim()
}

function nickname (row) {
  return (row.nickname ?? '').trim()
    || (row.firstName ?? '').match(PAREN_NICKNAME)?.[1].trim()
    || givenName(row)
}

function listNames (names) {
  return names.length > 1
    ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
    : names.join('')
}

function composeSalutations (recipients) {
  const sorted = [...recipients].sort(byName)
  const formal = row => [givenName(row), row.lastName, row.suffix].filter(Boolean).join(' ').trim()
  // A missing first name falls back to the person's full name, never a blank.
  const orFormal = pick => row => pick(row) || formal(row)

  // Shared surname compresses to "Harry, Judith and Mike Iannotti" — the
  // composeName rule, including that any suffix spells everyone out.
  const lastName = normalizePart(sorted[0]?.lastName)
  const sameSurname = sorted.length > 1 && lastName.length > 0
    && sorted.every(r => normalizePart(r.lastName) === lastName && !r.suffix)

  return {
    firstName: listNames(sorted.map(orFormal(givenName))),
    nickname: listNames(sorted.map(orFormal(nickname))),
    fullName: sameSurname
      ? `${listNames(sorted.map(orFormal(givenName)))} ${sorted.at(-1).lastName}`
      : listNames(sorted.map(formal)),
  }
}

function groupByAddress (rows) {
  const mailable = []
  const unmailable = []
  for (const row of rows) {
    if (hasStreet(row)) mailable.push(row)
    else unmailable.push({ name: fullName(row), reason: 'no street address' })
  }

  const groups = new Map()
  for (const row of mailable) {
    const key = normalizeAddress(row)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(row)
  }

  const labels = [...groups.values()].map(recipients => {
    const [sample] = [...recipients].sort(byName)
    return {
      name: composeName(recipients),
      salutations: composeSalutations(recipients),
      street: sample.street,
      unit: sample.unit ?? null,
      city: sample.city,
      state: sample.state,
      zip: sample.zip,
      // The primary (byName-first) recipient's real last name, exposed so the
      // client can offer a last-name sort without parsing it back out of the
      // composed `name` string ("Jane and John Smith" -> sorts under S).
      sortLastName: sample.lastName ?? null,
    }
  })

  labels.sort((a, b) => {
    const zip = String(a.zip ?? '').localeCompare(String(b.zip ?? ''))
    return zip !== 0 ? zip : a.name.localeCompare(b.name)
  })

  return {
    labels,
    summary: {
      recipientCount: rows.length,
      labelCount: labels.length,
      mergedCount: mailable.length - labels.length,
    },
    unmailable,
  }
}

module.exports = { normalizeAddress, composeName, composeSalutations, groupByAddress }
