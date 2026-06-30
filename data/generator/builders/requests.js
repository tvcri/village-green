import { BASE_DATE } from '../env.js'

const dt = (d) => d.toISOString().slice(0, 19).replace('T', ' ')
const addDays = (d, n) => new Date(d.getTime() + n * 86400000)

// status weights -> ~40% Open, ~30% Confirmed, ~15% Completed, ~10% Draft, ~5% cancelled
const STATUS_W = [['Open', 40], ['Confirmed', 30], ['Completed', 15], ['Draft', 10],
  ['Member cancelled', 2], ['Volunteer cancelled', 2], ['Hub cancelled', 1]]
const CANCELLED = new Set(['Member cancelled', 'Volunteer cancelled', 'Hub cancelled'])

export function buildRequests (plan, membership, content, rng) {
  const { byVillage } = plan
  const personById = Object.fromEntries(plan.person.map(p => [p.id, p]))
  const allDest = [...content.destinations.destinations, ...content.destinations.miskatonicHealth]
  const services = content.services.serviceNames
  // Correction #1: transportationTypes are objects {type, flavor}; extract .type for the column
  const transports = content.services.transportationTypes
  const gagFigures = content.people.figures.filter(f => f.tag === 'gag')
  // map a gag figure to a member person row by name
  const personByName = Object.fromEntries(plan.person.map(p => [p.full_name.toLowerCase(), p]))
  const memberPersonIds = new Set(membership.member.map(m => m.person_id))

  const service_request = []
  const notification_event = []
  const fcv_submission = []
  let srId = 0; let neId = 0; let fcvId = 0; let reqNo = 100

  const pushNotifications = (sr) => {
    const recips = JSON.stringify([sr.member_person_id, sr.volunteer_person_id].filter(Boolean))
    const events = []
    if (sr.status === 'Open' || sr.status === 'Confirmed' || sr.status === 'Completed' || CANCELLED.has(sr.status)) events.push('open')
    if (sr.status === 'Confirmed' || sr.status === 'Completed') events.push('confirmed')
    if (CANCELLED.has(sr.status)) events.push('cancelled')
    for (const et of events) {
      neId += 1
      const createdAt = addDays(BASE_DATE, -rng.int(1, 60))
      const sentAt = addDays(createdAt, rng.int(0, 1))
      notification_event.push({ id: neId, event_type: et, service_request_id: sr.id,
        created_at: dt(createdAt), sent_at: dt(sentAt), recipients: recips })
    }
  }

  const makeRequest = (villageId, memberPersonId, opts = {}) => {
    srId += 1; reqNo += 1
    const vols = byVillage[villageId].volunteers
    let status = opts.status || rng.weighted(STATUS_W)
    // deriveStatus constraint: Confirmed/Completed MUST have a volunteer — if none in village, downgrade to Open
    if ((status === 'Confirmed' || status === 'Completed') && !vols.length) status = 'Open'
    const wantsVol = status === 'Confirmed' || status === 'Completed' || (status === 'Draft' && rng.bool(0.3)) || (CANCELLED.has(status) && rng.bool(0.5))
    // Correction #1: always null for Open; otherwise pick volunteer only if wantsVol
    const volunteerPersonId = status === 'Open' ? null : (wantsVol && vols.length ? rng.pick(vols) : null)
    const past = status === 'Completed' || CANCELLED.has(status)
    const finish = addDays(BASE_DATE, past ? -rng.int(1, 120) : rng.int(1, 45))
    const svc = opts.serviceName ? { serviceName: opts.serviceName, capability: 'Rides' } : rng.pick(services)
    service_request.push({
      id: srId, request_number: reqNo, village_id: villageId,
      member_person_id: memberPersonId, volunteer_person_id: volunteerPersonId, status,
      service_name: svc.serviceName,
      // Correction #1: extract .type so the column stores a string, not an object
      transportation_type: rng.pick(transports).type,
      destination: opts.destination || rng.pick(allDest).name,
      created_at: dt(addDays(finish, -rng.int(1, 14))), start_at: dt(finish), finish_at: dt(finish),
      instructions: opts.description || svc.flavor || null,
      description: opts.description || null,
    })
    pushNotifications(service_request[service_request.length - 1])
  }

  // 1) Bespoke gag requests for gag cameos who landed as members.
  for (const fig of gagFigures) {
    const p = personByName[fig.name.toLowerCase()]
    if (!p || !memberPersonIds.has(p.id)) continue
    makeRequest(p.village_id, p.id, {
      status: rng.weighted([['Open', 3], ['Confirmed', 3], ['Completed', 2], ['Draft', 1]]),
      serviceName: fig.gag.serviceName, destination: fig.gag.destination, description: fig.gag.description,
    })
  }

  // 2) Ordinary requests, concentrated in big villages, to reach a healthy volume.
  for (const vid of Object.keys(byVillage).map(Number)) {
    const memberPersons = membership.member.filter(m => byVillage[vid].members.includes(m.person_id) && m.status === 'Active').map(m => m.person_id)
    const n = Math.max(2, Math.round(memberPersons.length * 0.8))
    for (let k = 0; k < n && memberPersons.length; k++) makeRequest(vid, rng.pick(memberPersons))
  }

  // 3) FCV submissions (Friendly Calls & Visits).
  const { contactTypes, activityTypes } = content.services.fcvActivities
  for (const vid of Object.keys(byVillage).map(Number)) {
    const village = content.__villageById[vid]
    const vols = byVillage[vid].volunteers; const mems = byVillage[vid].members
    const count = rng.int(8, 18)
    for (let k = 0; k < count && vols.length && mems.length; k++) {
      fcvId += 1
      const volP = personById[rng.pick(vols)]; const memP = personById[rng.pick(mems)]
      fcv_submission.push({
        id: fcvId, villageId: vid, villageName: village,
        volunteerPersonId: volP.id, rawVolunteerName: volP.full_name,
        memberPersonId: memP.id, rawMemberName: memP.full_name,
        visitDate: addDays(BASE_DATE, -rng.int(1, 200)).toISOString().slice(0, 10),
        timeSpentMinutes: rng.int(15, 120), contactType: rng.pick(contactTypes),
        activityTypes: JSON.stringify(rng.shuffle(activityTypes).slice(0, rng.int(1, 3))),
        activityOther: null, notes: rng.pick(content.services.fcvActivities.sampleNotes || [null]),
        submittedAt: dt(addDays(BASE_DATE, -rng.int(1, 200))),
      })
    }
  }

  return { service_request, notification_event, fcv_submission }
}
