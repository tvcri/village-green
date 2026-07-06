import { BASE_DATE } from '../env.js'
import { CAPABILITIES } from '../constants.js'

const isoDate = (d) => d.toISOString().slice(0, 10)
const addDays = (d, n) => new Date(d.getTime() + n * 86400000)

export function buildMembership (plan, content, rng) {
  const { person, byVillage } = plan
  const filler = plan.fillerIds ?? new Set()
  const personById = Object.fromEntries(person.map(p => [p.id, p]))

  // Lookup tables (capability is fixed; disability/vetting_type are demo-seeded from content.services).
  const disability = content.services.disabilities.map((name, i) => ({ id: i + 1, name }))
  const vetting_type = content.services.vettingTypes.map((v, i) => ({ id: i + 1, name: v.type || v }))
  const dropReasons = content.services.memberDropReasons
  const serviceNotes = content.services.memberServiceNotes || []
  const confidentialNotes = content.services.memberConfidentialNotes || []

  const member = []
  const volunteer = []
  const volunteer_capability = []
  const volunteer_vetting = []
  const person_disability = []
  let mId = 0; let vId = 0; let vcId = 0; let vvId = 0; let pdId = 0

  for (const vid of Object.keys(byVillage).map(Number)) {
    const { members, volunteers } = byVillage[vid]

    // members (de-dupe person ids within the village's member list)
    for (const personId of [...new Set(members)]) {
      mId += 1
      member.push({
        id: mId, personId: personId,
        memberNumber: `M-${String(vid).padStart(2, '0')}${String(mId).padStart(4, '0')}`,
        memberType: rng.pick(['Individual', 'Household']), primaryPersonId: null,
        secondaryType: null, joinDate: isoDate(addDays(BASE_DATE, -rng.int(30, 3000))),
        status: 'Active', // ~5% flip to Inactive/Dropped in the post-pass below
        dropReason: null,
        householdSize: rng.int(1, 2),
        // annual dues: $40 for most, some discounted/waived, a few higher tiers
        householdDues: rng.weighted([[40, 12], [0, 1], [20, 2], [25, 1], [30, 2], [50, 2], [60, 2]]),
        // standing mobility/quirk notes; requests echo these as instructions
        serviceNotes: serviceNotes.length && rng.bool(0.66) ? rng.pick(serviceNotes) : null,
        // staff-only notes — the app restricts who can see these
        confidentialNotes: confidentialNotes.length && rng.bool(0.4) ? rng.pick(confidentialNotes) : null,
      })
    }
    // ~1 household per village: link a second member to a primary as 'Spouse'
    const villageMembers = member.filter(r => members.includes(r.personId))
    if (villageMembers.length >= 2 && rng.bool(0.8)) {
      const [primary, secondary] = rng.shuffle(villageMembers).slice(0, 2)
      secondary.primaryPersonId = primary.personId
      secondary.secondaryType = 'Spouse'
      secondary.householdSize = 2; primary.householdSize = 2
    }

    // volunteers
    for (const personId of [...new Set(volunteers)]) {
      vId += 1
      // ~5% flip to inactive in the post-pass below
      volunteer.push({ id: vId, personId: personId, providerType: rng.pick(['Individual', 'Couple', 'Agency']), active: 1 })
      // 1-3 capabilities
      const caps = rng.shuffle(CAPABILITIES).slice(0, rng.int(1, 3))
      for (const c of caps) { vcId += 1; volunteer_capability.push({ id: vcId, volunteerId: vId, capabilityId: c.id }) }
      // ~40% have a vetting record (some expired)
      if (rng.bool(0.4) && vetting_type.length) {
        vvId += 1
        const entered = addDays(BASE_DATE, -rng.int(60, 1500))
        const expired = rng.bool(0.3) ? addDays(entered, 365) : addDays(BASE_DATE, rng.int(60, 700))
        volunteer_vetting.push({ id: vvId, volunteerId: vId, vettingTypeId: rng.pick(vetting_type).id, dateEntered: isoDate(entered), dateExpired: isoDate(expired) })
      }
    }
  }

  // ~5% of members and volunteers go inactive — drawn from the invented
  // filler persons first (they're the least-examined rows), topped up at random
  const fillerFirst = (rows) =>
    [...rng.shuffle(rows.filter(r => filler.has(r.personId))),
      ...rng.shuffle(rows.filter(r => !filler.has(r.personId)))]
  for (const r of fillerFirst(member).slice(0, Math.round(member.length * 0.05))) {
    r.status = rng.pick(['Inactive', 'Dropped'])
    r.dropReason = rng.pick(dropReasons)
  }
  for (const r of fillerFirst(volunteer).slice(0, Math.round(volunteer.length * 0.05))) r.active = 0

  // ~handful of disabilities across members
  const memberPersonIds = [...new Set(member.map(m => m.personId))]
  for (const personId of rng.shuffle(memberPersonIds).slice(0, Math.min(12, memberPersonIds.length))) {
    pdId += 1; person_disability.push({ id: pdId, personId: personId, disabilityId: rng.pick(disability).id })
  }

  return { member, volunteer, disability, vetting_type, volunteer_capability, volunteer_vetting, person_disability }
}
