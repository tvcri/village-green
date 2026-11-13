import { makeRng } from './rng.js'
import { CAPABILITIES } from './constants.js'
import { resolveVillages } from './sizing.js'
import { buildVillagesAndUsers } from './builders/villages.js'
import { buildPrivacy } from './builders/privacy.js'
import { buildPersons } from './builders/persons.js'
import { buildMembership } from './builders/membership.js'
import { buildCircles, CIRCLE } from './builders/circles.js'
import { buildVssUsers } from './builders/vss.js'
import { buildRequests } from './builders/requests.js'
import { applyPlants } from './plants.js'
import { applyContactVariety, applyEmailGaps } from './builders/contacts.js'
import { buildDeceased, buildPauses } from './builders/lifecycle.js'
import { buildTrainings } from './builders/trainings.js'
import { buildDonors } from './builders/donors.js'

// The account evt_auto_complete_service_requests audits as (0024). Seeding
// truncates user_data, so the generator must put this row back or the event
// finds no task user and silently transitions nothing. Keep it in step with
// the INSERT in 0024-task-user-attribution.js and generateSchema.sh.
const TASK_USERS = [{ username: '_task_auto_complete', taskName: 'auto_complete' }]

export function buildDataset (content, seed, sizing = {}) {
  const rng = makeRng(seed)
  // Work added after migration 27 draws from its own streams, so it leaves
  // the main stream (figures, villages, requests) exactly as it was.
  const stream = (k) => makeRng((seed + k * 0x9E3779B9) >>> 0)
  const villagesList = resolveVillages(sizing)
  const { village, user_data, role_grant, villageIdByName, creatorUserIds } =
    buildVillagesAndUsers(content, rng, villagesList)
  // requests builder needs villageId -> name; pass via a private field
  content.__villageById = Object.fromEntries(village.map(v => [v.id, v.name]))

  const personsPlan = buildPersons(content, villageIdByName, rng, villagesList)
  applyContactVariety(personsPlan, stream(1))
  const membership = buildMembership(personsPlan, content, rng, stream(2))
  const circles = buildCircles(personsPlan, membership, rng, villagesList, villageIdByName)
  // isVeteran mirrors 0027's one-time seed: set for the Veteran's Circle, else
  // unknown (NULL), never an asserted 0
  const veterans = new Set(circles.person_circle.filter(pc => pc.circleId === CIRCLE.veterans).map(pc => pc.personId))
  for (const p of personsPlan.person) p.isVeteran = veterans.has(p.id) ? 1 : null
  const vss = buildVssUsers(personsPlan, membership, user_data, rng)
  const privacy = buildPrivacy(user_data, rng)
  const requests = buildRequests(personsPlan, membership, content, rng, creatorUserIds, vss.userIdByPersonId)
  // Task accounts come after the privacy acks: they never sign in, so they
  // carry no acknowledgement and no login in the roster.
  for (const u of user_data) { u.status = 'available'; u.taskName = null }
  let nextUserId = user_data.reduce((m, u) => Math.max(m, u.userId), 0) + 1
  for (const t of TASK_USERS) user_data.push({ userId: nextUserId++, username: t.username, lastClaims: '{}', status: 'unavailable', taskName: t.taskName })

  const dataset = {
    village, user_data, role_grant,
    privacy_rules: privacy.privacy_rules, privacy_acknowledgement: privacy.privacy_acknowledgement,
    capability: CAPABILITIES.map(c => ({ id: c.id, name: c.name })),
    disability: membership.disability, vetting_type: membership.vetting_type, circle: circles.circle,
    member_drop_reason: membership.member_drop_reason, volunteer_drop_reason: membership.volunteer_drop_reason,
    person: personsPlan.person,
    member: membership.member, volunteer: membership.volunteer,
    volunteer_capability: membership.volunteer_capability,
    volunteer_vetting: membership.volunteer_vetting,
    person_disability: membership.person_disability, person_circle: circles.person_circle,
    member_circle_preference: circles.member_circle_preference,
    service_request: requests.service_request,
    notification_event: requests.notification_event,
    fcv_submission: requests.fcv_submission,
  }

  const plants = applyPlants(dataset, rng)
  dataset.__meta = { plants, villagesList, gagIndex: requests.gagIndex }

  // After the plants: these must agree with the finished requests and logins.
  applyEmailGaps(dataset, stream(3))
  plants.deceased = buildDeceased(dataset, stream(4))
  dataset.volunteer_pause = buildPauses(dataset, stream(5))
  Object.assign(dataset, buildTrainings(content, dataset, stream(6)))
  dataset.donor = buildDonors(dataset, sizing.donors ?? null, stream(7))

  return dataset
}

// Convenience loader of the committed content packs (used by cli.js).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
export function loadContent () {
  const read = (n) => JSON.parse(readFileSync(fileURLToPath(new URL(`../content/${n}`, import.meta.url)), 'utf8'))
  return { people: read('people.json'), services: read('services.json'), destinations: read('destinations.json') }
}
