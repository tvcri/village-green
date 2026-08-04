import { BASE_DATE } from '../env.js'
import { NO_LOCATION_SERVICES, TRANSPORT_RIDE_W, RI_STREETS } from '../constants.js'

const dt = (d) => d.toISOString().slice(0, 19).replace('T', ' ')
const addDays = (d, n) => new Date(d.getTime() + n * 86400000)
// minutes-since-midnight (UTC) on d's date — mirrors the UI's 15-minute slots.
// Internal busy-slot math only; persisted values use isoDate/timeStr below.
const atMinutes = (d, mins) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) + mins * 60000)
const isoDate = (d) => d.toISOString().slice(0, 10)
const timeStr = (mins) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}:00`

// status weights -> ~42% Open, ~33% Confirmed, ~17% Completed, ~8% cancelled
const STATUS_W = [['Open', 42], ['Confirmed', 33], ['Completed', 17],
  ['Member cancelled', 3], ['Volunteer cancelled', 3], ['Hub cancelled', 2]]
const CANCELLED = new Set(['Member cancelled', 'Volunteer cancelled', 'Hub cancelled'])

// Real destinations carry a real town; ops-ish pseudo-towns fall back to the member's city.
const cityFromTown = (town, fallback) => {
  if (!town || /statewide|various|every town|town-by-town|neighborhood/i.test(town)) return fallback
  return town.split(' & ')[0].split(' (')[0]
}

// people.json gag.serviceName is free text; the DB column is UI-enforced, so
// map it to one of the real serviceNameOptions values by keyword.
const gagCategory = (name) => {
  if (/^ride/i.test(name)) {
    if (/medical|health|hospital|surgery|doctor|dialysis|therapy|dentist/i.test(name)) return 'Ride: Medical Appnt'
    if (/barber|hair|salon|nails/i.test(name)) return 'Ride: Personal Care'
    if (/grocery|market|store|shopping/i.test(name)) return 'Ride: Shopping'
    if (/game|show|church|mass|bingo|concert|meeting|club/i.test(name)) return 'Ride: Activity/Event'
    return 'Ride: Other'
  }
  if (/vcr|printer|wi-?fi|phone|computer|tech/i.test(name)) return 'Tech Support'
  if (/pick up|pickup|deliver|drop off/i.test(name)) return 'Errand: Pick up/delivery'
  return 'Errand: Other'
}

export function buildRequests (plan, membership, content, rng, creatorUserIds = [], vssByPerson = {}) {
  const { byVillage } = plan
  const personById = Object.fromEntries(plan.person.map(p => [p.id, p]))
  const allDest = [...content.destinations.destinations, ...content.destinations.miskatonicHealth]
  // Destination pools matched to service category, so medical rides land at
  // Miskatonic Health and grocery runs at Stop & Shop — not the casino.
  const dests = content.destinations.destinations
  const healthDest = [...content.destinations.miskatonicHealth, ...dests.filter(d => /dialysis|medical center/i.test(d.name))]
  const shopDest = dests.filter(d => d.category === 'Food Landmark' || /market|stop & shop|mall|garden city|pharmacy/i.test(d.name))
  const careDest = dests.filter(d => /barber|salon/i.test(d.name))
  const errandDest = dests.filter(d => /Food Landmark|Civic\/Errand/.test(d.category))
  const outingDest = dests.filter(d => !/Civic\/Errand/.test(d.category))
  const destPoolFor = (category) => {
    if (category === 'Ride: Medical Appnt') return healthDest
    if (/Shopping/.test(category)) return shopDest
    if (category === 'Ride: Personal Care' && careDest.length) return careDest
    if (/Pick up|Personal Care/.test(category)) return errandDest
    if (category === 'Ride: Activity/Event') return outingDest
    return allDest
  }
  // Only catalog entries with a serviceName (a UI serviceNameOptions value)
  // become service requests; the rest (Friends/Circles/Governance/...) are FCV
  // or village-ops flavor. Weight the pool like prod: mostly rides, medical most.
  const services = content.services.catalog.filter(s => s.serviceName)
    .flatMap(s => Array(s.serviceName === 'Ride: Medical Appnt' ? 6 : s.serviceName.startsWith('Ride:') ? 3 : 1).fill(s))
  const gagFigures = content.people.figures.filter(f => f.tag === 'gag')
  // map a gag figure to a member person row by name
  const personByName = Object.fromEntries(plan.person.map(p => [plan.nameById[p.id].toLowerCase(), p]))
  const memberPersonIds = new Set(membership.member.map(m => m.personId))
  // standing member notes (member.serviceNotes) echo into request instructions, like prod
  const noteByPerson = Object.fromEntries(
    membership.member.filter(m => m.serviceNotes).map(m => [m.personId, m.serviceNotes]))

  const service_request = []
  const notification_event = []
  const fcv_submission = []
  let srId = 0; let neId = 0; let fcvId = 0; let reqNo = 27100

  const pushNotifications = (sr) => {
    const recips = JSON.stringify([sr.memberPersonId, sr.volunteerPersonId].filter(Boolean))
    const events = []
    if (sr.status === 'Open' || sr.status === 'Confirmed' || sr.status === 'Completed' || CANCELLED.has(sr.status)) events.push('open')
    if (sr.status === 'Confirmed' || sr.status === 'Completed') events.push('confirmed')
    if (CANCELLED.has(sr.status)) events.push('cancelled')
    for (const et of events) {
      neId += 1
      const createdAt = addDays(BASE_DATE, -rng.int(1, 60))
      const sentAt = addDays(createdAt, rng.int(0, 1))
      notification_event.push({ id: neId, eventType: et, serviceRequestId: sr.id,
        createdAt: dt(createdAt), sentAt: dt(sentAt), recipients: recips })
    }
  }

  // memberPersonId -> [startMs, endMs][] — members can hold several requests,
  // but never two that overlap in time
  const busyByMember = {}

  const makeRequest = (villageId, memberPersonId, opts = {}) => {
    const vols = byVillage[villageId].volunteers
    const creators = creatorUserIds
    let status = opts.status || rng.weighted(STATUS_W)
    // deriveStatus constraint: Confirmed/Completed MUST have a volunteer — if none in village, downgrade to Open
    if ((status === 'Confirmed' || status === 'Completed') && !vols.length) status = 'Open'
    const wantsVol = status === 'Confirmed' || status === 'Completed' || (CANCELLED.has(status) && rng.bool(0.5))
    // always null for Open; otherwise pick volunteer only if wantsVol
    const volunteerPersonId = status === 'Open' ? null : (wantsVol && vols.length ? rng.pick(vols) : null)
    const past = status === 'Completed' || CANCELLED.has(status)

    const svc = opts.gag ? null : rng.pick(services)
    const category = opts.gag ? gagCategory(opts.gag.serviceName) : svc.serviceName
    const isRide = category.startsWith('Ride:')
    const transportationType = isRide ? rng.weighted(TRANSPORT_RIDE_W) : 'None'
    const roundTrip = transportationType === 'Round Trip'

    // UI time flow — Round Trip: Start -> Arrival -> Return -> Finish; One Way: Start -> Finish.
    // Rides are mostly timed; ~15% are "no specific times". Non-Rides never
    // carry times (times are a Rides-only concept — CLAUDE.md).
    // Re-roll the day/slot until it clears the member's other requests; a
    // flexible request blocks its nominal slot, so two flexible requests
    // can't share a date either.
    const flexible = !isRide || rng.bool(0.15)
    const dateOnly = flexible
    const busy = (busyByMember[memberPersonId] ??= [])
    let day, startMin, durMin, slot = null
    for (let attempt = 0; attempt < 10 && !slot; attempt++) {
      day = addDays(BASE_DATE, past ? -rng.int(1, 120) : rng.int(1, 45))
      startMin = dateOnly ? 4 * 60 : rng.int(32, 68) * 15 // 8:00 AM .. 5:00 PM slots
      durMin = dateOnly ? 0 : (isRide ? (roundTrip ? rng.int(5, 10) * 15 : rng.int(2, 4) * 15) : rng.int(4, 8) * 15)
      const s = atMinutes(day, startMin).getTime()
      const e = atMinutes(day, startMin + Math.max(durMin, 15)).getTime()
      if (!busy.some(([bs, be]) => s < be && bs < e)) slot = [s, e]
    }
    if (!slot) return // calendar is packed — skip rather than double-book
    busy.push(slot)
    const legMin = rng.int(1, 2) * 15 // travel leg used to seed arrival/return

    // Ride geography (spec §2): most rides start from home; some return home
    // from a venue; a few have NULL start* like migrated history.
    const home = personById[memberPersonId]
    let start = null; let startAddress = null; let startCity = null
    let startState = null; let startZip = null; let startPhone = null
    let destination = null; let address = null; let city = null; let state = null; let zip = null; let phone = null
    if (!NO_LOCATION_SERVICES.includes(category)) {
      const memberCity = home?.city || null
      const venue = opts.gag ? { name: opts.gag.destination, town: null } : rng.pick(destPoolFor(category))
      const venueCity = opts.gag ? memberCity : cityFromTown(venue.town, memberCity)
      const shape = isRide ? rng.weighted([['homeOut', 70], ['outHome', 15], ['legacy', 15]]) : 'legacy'
      if (shape === 'outHome') {
        start = venue.name
        startAddress = `${rng.int(1, 2400)} ${rng.pick(RI_STREETS)}`
        startCity = venueCity; startState = 'RI'
        destination = 'Home'
        address = home.street; city = home.city; state = 'RI'; zip = home.zip; phone = home.phone
      } else {
        if (shape === 'homeOut') {
          start = 'Home'
          startAddress = home.street; startCity = home.city; startState = 'RI'
          startZip = home.zip; startPhone = home.phone
        }
        destination = venue.name
        address = `${rng.int(1, 2400)} ${rng.pick(RI_STREETS)}`
        city = venueCity; state = 'RI'
        zip = rng.bool(0.5) ? String(rng.int(2801, 2920)).padStart(5, '0') : null
        phone = rng.bool(0.4) ? `401-${rng.int(200, 989)}-${String(rng.int(0, 9999)).padStart(4, '0')}` : null
      }
    }

    const description = opts.gag
      ? `${opts.gag.serviceName} — ${opts.gag.description}`
      : (svc.flavor ? `${svc.description}. ${svc.flavor}` : `${svc.description}.`)

    // Standing requests — regulars re-book the same trip on a cadence (dialysis
    // runs, weekly shopping, Poe's cemetery visit). We're deliberately loose
    // about what counts as "recurring": it's demo data — if Roger Williams
    // draws a second banishment ride a month later, so be it. Decided up front
    // so the booking timestamp predates the series' earliest occurrence.
    // gag cameos are the showpieces — let their bespoke requests recur a bit
    // more often so a browse-through hits one quickly
    const recurP = (category === 'Ride: Medical Appnt' ? 0.6 : isRide ? 0.4 : 0.25) + (opts.gag ? 0.15 : 0)
    let recur = null
    if (rng.bool(recurP)) {
      // the series spans both directions — a standing booking has history
      const extra = rng.int(2, 5)
      recur = { stepDays: rng.pick([7, 14, 28]), extra, back: rng.int(0, extra) }
    }

    // The whole series (base + any recurrences) shares one booking: same staff
    // creator, same entry timestamp, same slot and trip shape — only the date,
    // status, and volunteer vary per occurrence.
    const creatorId = creators.length ? rng.pick(creators) : null
    const earliestDay = recur ? addDays(day, -recur.stepDays * recur.back) : day
    const createdAtDate = addDays(earliestDay, -rng.int(1, 14))
    const createdAtStr = dt(createdAtDate)
    const emit = (d, occStatus, occVolunteer) => {
      srId += 1
      service_request.push({
        id: srId,
        // prod mix: CE-era requests carry a number, VG-native ones are null
        requestNumber: rng.bool(0.35) ? null : (reqNo += 1),
        villageId: villageId,
        memberPersonId: memberPersonId, volunteerPersonId: occVolunteer, status: occStatus,
        serviceName: category,
        transportationType: transportationType,
        // staff attribution — entered by a manager or owner of the village
        createdUserId: creatorId,
        createdAt: createdAtStr,
        serviceDate: isoDate(d),
        timesFlexible: flexible ? 1 : 0,
        startTime: flexible ? null : timeStr(startMin),
        finishTime: flexible ? null : timeStr(startMin + durMin),
        apptTime: !flexible && roundTrip ? timeStr(startMin + legMin) : null,
        returnTime: !flexible && roundTrip ? timeStr(startMin + durMin - legMin) : null,
        start, startAddress, startCity, startState, startZip, startPhone,
        destination, address, city, state, zip, phone,
        instructions: noteByPerson[memberPersonId] || null,
        description,
        // VSS marker: only a volunteer's own self-service touch sets modified*
        modifiedUserId: (vssByPerson[occVolunteer] && (occStatus === 'Confirmed' || occStatus === 'Completed'))
          ? vssByPerson[occVolunteer] : null,
        modifiedAt: (vssByPerson[occVolunteer] && (occStatus === 'Confirmed' || occStatus === 'Completed'))
          ? dt(addDays(createdAtDate, rng.int(0, 3))) : null,
      })
      pushNotifications(service_request[service_request.length - 1])
    }
    emit(day, status, volunteerPersonId)

    if (recur) {
      // regulars usually get the same driver for every occurrence; prefer a
      // VSS-enabled volunteer so most series have a regular who can self-serve
      const vssVols = vols.filter(v => vssByPerson[v])
      const regular = volunteerPersonId ||
        (vssVols.length && rng.bool(0.7) ? rng.pick(vssVols) : (vols.length ? rng.pick(vols) : null))
      for (let k = -recur.back; k <= recur.extra - recur.back; k++) {
        if (k === 0) continue // the base occurrence, already emitted
        const d = addDays(day, recur.stepDays * k)
        const s = atMinutes(d, startMin).getTime()
        const e = atMinutes(d, startMin + Math.max(durMin, 15)).getTime()
        if (busy.some(([bs, be]) => s < be && bs < e)) continue // that day's taken
        const occStatus = d < BASE_DATE
          ? rng.weighted([['Completed', 8], ['Member cancelled', 1], ['Volunteer cancelled', 1]])
          : rng.weighted([['Confirmed', 1], ['Open', 1]])
        const occVolunteer = occStatus === 'Open' ? null
          : (occStatus === 'Completed' || occStatus === 'Confirmed') ? regular
            : (rng.bool(0.5) ? regular : null)
        if ((occStatus === 'Completed' || occStatus === 'Confirmed') && !occVolunteer) continue
        busy.push([s, e])
        emit(d, occStatus, occVolunteer)
      }
    }
  }

  // 1) Bespoke gag requests for gag cameos who landed as members.
  for (const fig of gagFigures) {
    const p = personByName[fig.name.toLowerCase()]
    if (!p || !memberPersonIds.has(p.id)) continue
    makeRequest(p.villageId, p.id, {
      status: rng.weighted([['Open', 3], ['Confirmed', 3], ['Completed', 2]]),
      gag: fig.gag,
    })
  }

  // 2) Ordinary requests, concentrated in big villages, to reach a healthy volume.
  // (Draw rate is per BOOKING — standing bookings fan out into several rows.)
  for (const vid of Object.keys(byVillage).map(Number)) {
    const memberPersons = membership.member.filter(m => byVillage[vid].members.includes(m.personId) && m.status === 'Active').map(m => m.personId)
    const n = Math.max(2, Math.round(memberPersons.length * 0.5))
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
        volunteerPersonId: volP.id, rawVolunteerName: plan.nameById[volP.id],
        memberPersonId: memP.id, rawMemberName: plan.nameById[memP.id],
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
