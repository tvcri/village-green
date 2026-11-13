import { BASE_DATE } from '../env.js'

const isoDate = (d) => d.toISOString().slice(0, 10)
const addDays = (d, n) => new Date(d.getTime() + n * 86400000)

// Volunteer trainings and positions (0028). Both catalogs start empty in a
// real install; the demo fills them from content/services.json so the
// volunteer page and the catalog editors have something to show.
//
// Position scope rules (service/volunteerAssignments.js): a village position
// carries a villageId, which must be the volunteer's home village (or an
// associate village; the demo has none); a circle position carries only a
// circleId; a Hub (federation) position carries neither.

// capability ids fixed by the static seed (constants.js CAPABILITIES)
const CAP = { friends: 2, techSupport: 4, rides: 5 }

export function buildTrainings (content, ds, rng) {
  const training = (content.services.trainings || []).map((t, i) => ({ id: i + 1, name: t.name, description: t.description }))
  const position = (content.services.positions || []).map((p, i) => ({ id: i + 1, name: p.name, description: p.description, scope: p.scope }))
  const trainingId = Object.fromEntries(training.map(t => [t.name, t.id]))
  const positionByName = Object.fromEntries(position.map(p => [p.name, p]))
  const position_training = (content.services.positions || []).flatMap((p, i) =>
    p.trainings.map(name => ({ positionId: i + 1, trainingId: trainingId[name] })))

  const capsByVolunteer = {}
  for (const vc of ds.volunteer_capability) (capsByVolunteer[vc.volunteerId] ??= new Set()).add(vc.capabilityId)

  // Which trainings a volunteer takes, by what they do. Undated completions
  // are a real pattern (records carried over without a date).
  const volunteer_training = []
  const take = (v, name) => {
    if (!trainingId[name]) return
    volunteer_training.push({
      id: volunteer_training.length + 1, volunteerId: v.id, trainingId: trainingId[name],
      completedDate: rng.bool(0.9) ? isoDate(addDays(BASE_DATE, -rng.int(20, 1500))) : null,
      notes: rng.bool(0.08) ? rng.pick(['Make-up session', 'Completed online', 'Refresher due next year']) : null,
    })
  }
  for (const v of ds.volunteer) {
    const caps = capsByVolunteer[v.id] || new Set()
    // a Pending volunteer is usually still waiting on orientation
    if (rng.bool(v.status === 'Pending' ? 0.2 : 0.7)) take(v, 'Volunteer Orientation')
    if (caps.has(CAP.rides) && rng.bool(0.5)) take(v, 'Driver Safety')
    if (rng.bool(0.25)) take(v, 'Confidentiality and Privacy')
    if (caps.has(CAP.techSupport) && rng.bool(0.4)) take(v, 'Tech Coaching Basics')
    if (caps.has(CAP.friends) && rng.bool(0.4)) take(v, 'Friendly Caller Training')
  }

  // Positions go to Active volunteers: one Steering Committee seat per
  // village, then a scattering of the others.
  const personById = Object.fromEntries(ds.person.map(p => [p.id, p]))
  const circlesByPerson = {}
  for (const pc of ds.person_circle) (circlesByPerson[pc.personId] ??= []).push(pc.circleId)
  const active = ds.volunteer.filter(v => v.status === 'Active' && !personById[v.personId].deceased)
  const volunteer_position = []
  const keys = new Set()
  const assign = (v, pos) => {
    const p = personById[v.personId]
    let villageId = null; let circleId = null
    if (pos.scope === 'village') villageId = p.villageId
    else if (pos.scope === 'circle') {
      const circles = circlesByPerson[p.id]
      if (!circles?.length) return false
      circleId = rng.pick(circles)
    }
    if (pos.scope === 'village' && villageId === null) return false
    const key = `${v.id}|${pos.id}|${villageId}|${circleId}`
    if (keys.has(key)) return false
    keys.add(key)
    volunteer_position.push({ id: volunteer_position.length + 1, volunteerId: v.id, positionId: pos.id, villageId, circleId })
    return true
  }
  const steering = positionByName['Steering Committee']
  if (steering) {
    const byVillage = {}
    for (const v of active) (byVillage[personById[v.personId].villageId] ??= []).push(v)
    for (const vid of Object.keys(byVillage).map(Number).sort((a, b) => a - b)) assign(rng.pick(byVillage[vid]), steering)
  }
  const others = position.filter(p => p !== steering)
  if (others.length) {
    for (const v of rng.shuffle(active).slice(0, Math.round(active.length * 0.1))) assign(v, rng.pick(others))
  }

  return { training, position, position_training, volunteer_training, volunteer_position }
}
