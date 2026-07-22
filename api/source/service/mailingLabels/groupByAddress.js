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
  return [row.firstName, row.lastName].filter(Boolean).join(' ').trim()
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
  const sameSurname = normalizePart(first.lastName) === normalizePart(second.lastName)
    && normalizePart(first.lastName).length > 0
  return sameSurname
    ? `${first.firstName} and ${second.firstName} ${second.lastName}`
    : `${fullName(first)} and ${fullName(second)}`
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

module.exports = { normalizeAddress, composeName, groupByAddress }
