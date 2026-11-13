import { BASE_DATE } from '../env.js'

const isoDate = (d) => d.toISOString().slice(0, 10)
const addDays = (d, n) => new Date(d.getTime() + n * 86400000)
const TODAY = isoDate(BASE_DATE)

// Deceased people (0029) and volunteer pauses (0031). Both run after the
// requests and plants, because each must agree with the requests already
// built: nobody who has passed is on an upcoming or open request, and no
// paused volunteer is assigned on a date their pause covers.
//
// Death never writes a role status (0029 D2): person.deceased is the single
// source of truth, and the active_* views exclude deceased people by joining
// it. So a deceased member can still read Active on the member row.

// Requests a person is on, as member or volunteer.
function requestsByPerson (serviceRequests) {
  const out = {}
  for (const sr of serviceRequests) {
    for (const pid of [sr.memberPersonId, sr.volunteerPersonId]) {
      if (pid !== null && pid !== undefined) (out[pid] ??= []).push(sr)
    }
  }
  return out
}

export function buildDeceased (ds, rng) {
  const srs = requestsByPerson(ds.service_request)
  const personById = Object.fromEntries(ds.person.map(p => [p.id, p]))
  // Off limits: anyone with a request today or later, or one still Open or
  // Confirmed; every login's volunteer (VSS identity needs an active
  // volunteer); and the people the planted scenarios name.
  const loginEmails = new Set(ds.user_data.map(u => u.username))
  const memberIds = new Set(ds.member.map(m => m.personId))
  const planted = new Set()
  for (const m of ds.member) {
    if (m.primaryPersonId !== null) { planted.add(m.personId); planted.add(m.primaryPersonId) }
    if (m.scNotes) planted.add(m.personId)
  }
  for (const v of ds.volunteer) if (memberIds.has(v.personId)) planted.add(v.personId)
  const eligible = ds.person.filter(p => {
    if (planted.has(p.id) || loginEmails.has(p.email)) return false
    return !(srs[p.id] || []).some(sr => sr.serviceDate >= TODAY || sr.status === 'Open' || sr.status === 'Confirmed')
  })
  // A plain shuffle, not filler-first: the status post-pass already prefers
  // the filler people, and drawing from them again would put every death on
  // a Pending or Dropped row. One Active member goes first, so the case that
  // matters most (a member who reads Active but has left active_member) is
  // always present.
  const activeMemberIds = new Set(ds.member.filter(m => m.status === 'Active').map(m => m.personId))
  const shuffled = rng.shuffle(eligible)
  const first = shuffled.find(p => activeMemberIds.has(p.id))
  const ordered = first ? [first, ...shuffled.filter(p => p !== first)] : shuffled
  const count = Math.min(ordered.length, Math.max(2, Math.round(ds.person.length * 0.03)))

  for (const p of ds.person) { p.deceased = 0; p.deceasedDate = null }
  const deceased = ordered.slice(0, count)
  for (const p of deceased) {
    p.deceased = 1
    // Most have a date, after their last request; a few are flagged with the
    // date unknown, which the schema allows (the CHECK only ties a date to
    // the flag).
    if (!rng.bool(0.85)) continue
    const last = (srs[p.id] || []).map(sr => sr.serviceDate).sort().at(-1)
    const lo = Math.max(last ? Math.round((new Date(last + 'T12:00:00Z') - BASE_DATE) / 86400000) + 1 : -720, -720)
    personById[p.id].deceasedDate = isoDate(addDays(BASE_DATE, rng.int(lo, -1)))
  }
  return deceased.map(p => p.id)
}

// One rule per volunteer (volunteerId is the key). The shapes cover what the
// UI shows: an open-ended pause, one in effect with an end date, an upcoming
// date window, and an expired window (expired rows stay until replaced).
const PAUSE_SHAPES = [
  { scope: 'all', start: null, end: null },
  { scope: 'all', start: -20, end: 30 },
  { scope: 'window', start: 10, end: 24 },
  { scope: 'window', start: -60, end: -45 },
  { scope: 'all', start: 5, end: null },
]

export function buildPauses (ds, rng) {
  const srs = requestsByPerson(ds.service_request)
  const personById = Object.fromEntries(ds.person.map(p => [p.id, p]))
  const active = ds.volunteer.filter(v => v.status === 'Active' && !personById[v.personId].deceased)
  const target = Math.max(1, Math.round(active.length * 0.05))
  const volunteer_pause = []
  for (const v of rng.shuffle(active)) {
    if (volunteer_pause.length >= target) break
    const shape = PAUSE_SHAPES[volunteer_pause.length % PAUSE_SHAPES.length]
    const startDate = shape.start === null ? null : isoDate(addDays(BASE_DATE, shape.start))
    const endDate = shape.end === null ? null : isoDate(addDays(BASE_DATE, shape.end))
    const covers = (d) => (startDate === null || d >= startDate) && (endDate === null || d <= endDate)
    const assigned = (srs[v.personId] || []).filter(sr => sr.volunteerPersonId === v.personId)
    if (assigned.some(sr => covers(sr.serviceDate))) continue
    volunteer_pause.push({ volunteerId: v.id, startDate, endDate, scope: shape.scope })
  }
  return volunteer_pause
}
