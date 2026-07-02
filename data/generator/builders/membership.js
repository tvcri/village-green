import { BASE_DATE } from '../env.js'
import { CAPABILITIES } from '../constants.js'

const isoDate = (d) => d.toISOString().slice(0, 10)
const addDays = (d, n) => new Date(d.getTime() + n * 86400000)

export function buildMembership (plan, content, rng) {
  const { person, byVillage } = plan
  const personById = Object.fromEntries(person.map(p => [p.id, p]))

  // Lookup tables (capability is fixed; disability/vetting_type are demo-seeded from content.services).
  const disability = content.services.disabilities.map((name, i) => ({ id: i + 1, name }))
  const vetting_type = content.services.vettingTypes.map((v, i) => ({ id: i + 1, name: v.type || v }))
  const dropReasons = content.services.memberDropReasons
  const serviceNotes = content.services.memberServiceNotes || []

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
      const inactive = rng.bool(0.12)
      member.push({
        id: mId, person_id: personId,
        member_number: `M-${String(vid).padStart(2, '0')}${String(mId).padStart(4, '0')}`,
        member_type: rng.pick(['Individual', 'Household']), primary_person_id: null,
        secondary_type: null, join_date: isoDate(addDays(BASE_DATE, -rng.int(30, 3000))),
        status: inactive ? rng.pick(['Inactive', 'Dropped']) : 'Active',
        drop_reason: inactive ? rng.pick(dropReasons) : null,
        household_size: rng.int(1, 2),
        // standing mobility/quirk notes; requests echo these as instructions
        service_notes: serviceNotes.length && rng.bool(0.35) ? rng.pick(serviceNotes) : null,
      })
    }
    // ~1 household per village: link a second member to a primary as 'Spouse'
    const villageMembers = member.filter(r => members.includes(r.person_id))
    if (villageMembers.length >= 2 && rng.bool(0.8)) {
      const [primary, secondary] = rng.shuffle(villageMembers).slice(0, 2)
      secondary.primary_person_id = primary.person_id
      secondary.secondary_type = 'Spouse'
      secondary.household_size = 2; primary.household_size = 2
    }

    // volunteers
    for (const personId of [...new Set(volunteers)]) {
      vId += 1
      const active = rng.bool(0.88) ? 1 : 0
      volunteer.push({ id: vId, person_id: personId, provider_type: rng.pick(['Individual', 'Couple', 'Agency']), active })
      // 1-3 capabilities
      const caps = rng.shuffle(CAPABILITIES).slice(0, rng.int(1, 3))
      for (const c of caps) { vcId += 1; volunteer_capability.push({ id: vcId, volunteer_id: vId, capability_id: c.id }) }
      // ~40% have a vetting record (some expired)
      if (rng.bool(0.4) && vetting_type.length) {
        vvId += 1
        const entered = addDays(BASE_DATE, -rng.int(60, 1500))
        const expired = rng.bool(0.3) ? addDays(entered, 365) : addDays(BASE_DATE, rng.int(60, 700))
        volunteer_vetting.push({ id: vvId, volunteer_id: vId, vetting_type_id: rng.pick(vetting_type).id, date_entered: isoDate(entered), date_expired: isoDate(expired) })
      }
    }
  }

  // ~handful of disabilities across members
  const memberPersonIds = [...new Set(member.map(m => m.person_id))]
  for (const personId of rng.shuffle(memberPersonIds).slice(0, Math.min(12, memberPersonIds.length))) {
    pdId += 1; person_disability.push({ id: pdId, person_id: personId, disability_id: rng.pick(disability).id })
  }

  return { member, volunteer, disability, vetting_type, volunteer_capability, volunteer_vetting, person_disability }
}
