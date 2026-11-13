import { BASE_DATE } from '../env.js'

const isoDate = (d) => d.toISOString().slice(0, 10)
const addDays = (d, n) => new Date(d.getTime() + n * 86400000)

export const DEFAULT_DONOR_SHARE = 0.2

// Donor rows (0032): one per person marked Donor, holding the link back to
// LGL and the last gift date. `count` is the VG_DEMO_DONORS knob: null means
// the default share of people, 0 means no donors at all. The LGL sync's test
// harness sets 0 and makes its own links, since a donor whose constituent id
// LGL does not hold reads to the sync as a deleted donor.
//
// The ids are obviously invented ("DEMO-" and a number) so no generated row
// can be mistaken for, or collide with, a real LGL constituent. A couple is
// often one LGL constituent, so a donor's spouse usually shares the id.
export function buildDonors (ds, count, rng) {
  const people = ds.person
  const want = count === null || count === undefined ? Math.round(people.length * DEFAULT_DONOR_SHARE) : count
  if (!Number.isInteger(want) || want < 0) throw new Error(`VG_DEMO_DONORS must be a whole number of people, got ${count}`)
  const n = Math.min(want, people.length)

  const spouseOf = {}
  for (const m of ds.member) {
    if (m.primaryPersonId !== null) { spouseOf[m.primaryPersonId] = m.personId; spouseOf[m.personId] = m.primaryPersonId }
  }
  const donor = []
  const taken = new Set()
  let nextConstituent = 100001
  const add = (personId, lglConstituentId, lastGiftDate) => {
    taken.add(personId)
    donor.push({ id: donor.length + 1, personId, lglConstituentId, lastGiftDate })
  }
  for (const p of rng.shuffle(people)) {
    if (donor.length >= n) break
    if (taken.has(p.id)) continue
    const id = `DEMO-${nextConstituent++}`
    const lastGiftDate = rng.bool(0.85) ? isoDate(addDays(BASE_DATE, -rng.int(0, 1100))) : null
    add(p.id, id, lastGiftDate)
    const spouse = spouseOf[p.id]
    if (spouse && !taken.has(spouse) && donor.length < n && rng.bool(0.7)) add(spouse, id, lastGiftDate)
  }
  return donor
}
