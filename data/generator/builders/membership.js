import { BASE_DATE } from '../env.js'
import { CAPABILITIES } from '../constants.js'

const isoDate = (d) => d.toISOString().slice(0, 10)
const addDays = (d, n) => new Date(d.getTime() + n * 86400000)

// `xrng` is a second, independent stream for decisions added after migration
// 27 (drop-reason ids, status notes). Drawing those from `rng` would shift
// every later draw and reshuffle the whole dataset for the same seed.
export function buildMembership (plan, content, rng, xrng = rng) {
  const { person, byVillage } = plan
  const filler = plan.fillerIds ?? new Set()
  const personById = Object.fromEntries(person.map(p => [p.id, p]))

  // Lookup tables (capability is fixed; disability/vetting_type are demo-seeded from content.services).
  const disability = content.services.disabilities.map((name, i) => ({ id: i + 1, name }))
  const vetting_type = content.services.vettingTypes.map((v, i) => ({ id: i + 1, name: v.type || v }))
  const dropReasons = content.services.memberDropReasons
  // Drop-reason catalogs (0029, 0030) start empty in a real install; staff own
  // them. The demo fills both, and retires one member reason so the editor
  // shows a retired row still attached to old members.
  const member_drop_reason = dropReasons.map((name, i) => ({
    id: i + 1, name, description: null, retired: i === dropReasons.length - 1 ? 1 : 0,
  }))
  member_drop_reason[0].description = 'Left Rhode Island'
  const volunteer_drop_reason = (content.services.volunteerDropReasons || []).map((name, i) => ({
    id: i + 1, name, description: null, retired: 0,
  }))
  const serviceNotes = content.services.memberServiceNotes || []
  const scNotes = content.services.memberScNotes || []
  const volunteerNotes = content.services.volunteerNotes || []
  // deliberately disability-agnostic phrasing — a random note pairs with any condition
  const disabilityNotes = content.services.disabilityNotes || []

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
        status: 'Active', // ~5% flip to Pending/Dropped in the post-pass below
        dropReason: null, dropReasonId: null,
        householdSize: rng.int(1, 2),
        // MONTHLY dues (the column's semantics — PR #93): $40/mo for most,
        // some discounted/waived. The cents values mimic rows the importer
        // produced by dividing a yearly application figure by 12.
        householdDues: rng.weighted([[40, 12], [0, 1], [20, 2], [25, 1], [33.33, 2], [50, 2], [8.33, 2]]),
        // standing mobility/quirk notes; requests echo these as instructions
        serviceNotes: serviceNotes.length && rng.bool(0.66) ? rng.pick(serviceNotes) : null,
        // service-coordinator notes — the app restricts who can see these
        scNotes: scNotes.length && rng.bool(0.4) ? rng.pick(scNotes) : null,
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
      // ~5% flip to Pending/Dropped in the post-pass below
      volunteer.push({
        id: vId, personId: personId, providerType: rng.pick(['Individual', 'Couple', 'Agency']), status: 'Active',
        dropReasonId: null, statusChangeNotes: null,
        notes: volunteerNotes.length && rng.bool(0.5) ? rng.pick(volunteerNotes) : null,
      })
      // 1-3 capabilities
      const caps = rng.shuffle(CAPABILITIES).slice(0, rng.int(1, 3))
      for (const c of caps) { vcId += 1; volunteer_capability.push({ id: vcId, volunteerId: vId, capabilityId: c.id }) }
      // ~40% have a vetting record; vettings never expire in practice (spec §6)
      if (rng.bool(0.4) && vetting_type.length) {
        vvId += 1
        const entered = addDays(BASE_DATE, -rng.int(60, 1500))
        const expired = addDays(BASE_DATE, rng.int(60, 700))
        volunteer_vetting.push({ id: vvId, volunteerId: vId, vettingTypeId: rng.pick(vetting_type).id, dateEntered: isoDate(entered), dateExpired: isoDate(expired) })
      }
    }
  }

  // ~5% of members and volunteers go inactive — drawn from the invented
  // filler persons first (they're the least-examined rows), topped up at random
  const fillerFirst = (rows) =>
    [...rng.shuffle(rows.filter(r => filler.has(r.personId))),
      ...rng.shuffle(rows.filter(r => !filler.has(r.personId)))]
  // Member statuses are Active, Pending, Dropped (0029); there is no Inactive.
  // A Dropped member mostly carries a catalog reason, as the app now writes;
  // the rest carry only the legacy free-text dropReason, like rows that
  // predate the catalog. The CHECKs allow a reason only on a Dropped row.
  for (const r of fillerFirst(member).slice(0, Math.round(member.length * 0.05))) {
    r.status = rng.pick(['Pending', 'Dropped'])
    const legacy = rng.pick(dropReasons)
    if (r.status !== 'Dropped') continue
    if (xrng.bool(0.7)) r.dropReasonId = xrng.pick(member_drop_reason).id
    else r.dropReason = legacy
  }
  const volunteerNotesByStatus = {
    Dropped: ['Asked to be removed from the call list.', 'Returned their badge at the office.'],
    Pending: ['Application received; waiting on references.', 'Orientation scheduled for next month.'],
  }
  fillerFirst(volunteer).slice(0, Math.round(volunteer.length * 0.05))
    .forEach((r, i) => {
      r.status = i % 2 ? 'Dropped' : 'Pending'
      if (r.status === 'Dropped' && volunteer_drop_reason.length && xrng.bool(0.75)) r.dropReasonId = xrng.pick(volunteer_drop_reason).id
      if (xrng.bool(0.5)) r.statusChangeNotes = xrng.pick(volunteerNotesByStatus[r.status])
    })

  // ~handful of disabilities across members
  const memberPersonIds = [...new Set(member.map(m => m.personId))]
  for (const personId of rng.shuffle(memberPersonIds).slice(0, Math.min(12, memberPersonIds.length))) {
    pdId += 1
    person_disability.push({
      id: pdId, personId: personId, disabilityId: rng.pick(disability).id,
      note: disabilityNotes.length && rng.bool(0.5) ? rng.pick(disabilityNotes) : null,
    })
  }

  return { member, volunteer, disability, vetting_type, volunteer_capability, volunteer_vetting, person_disability,
    member_drop_reason, volunteer_drop_reason }
}
