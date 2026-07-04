import { makeRng } from './rng.js'
import { CAPABILITIES, ROLE } from './constants.js'
import { buildVillagesAndUsers } from './builders/villages.js'
import { buildPersons } from './builders/persons.js'
import { buildMembership } from './builders/membership.js'
import { buildRequests } from './builders/requests.js'

export function buildDataset (content, seed) {
  const rng = makeRng(seed)
  const { village, user_data, village_grant, villageIdByName, adminUserId } = buildVillagesAndUsers(content, rng)
  // requests builder needs villageId -> name; pass via a private field
  content.__villageById = Object.fromEntries(village.map(v => [v.id, v.name]))

  // Service requests are entered by village staff — any manager or owner of
  // the village is a plausible creator (created_user_id attribution). The dev
  // admin owns every village but shouldn't dominate the byline, so skip it.
  const creatorsByVillage = {}
  for (const g of village_grant) {
    if (g.userId === adminUserId) continue
    if (g.roleId === ROLE.manage || g.roleId === ROLE.owner) (creatorsByVillage[g.villageId] ??= []).push(g.userId)
  }

  const personsPlan = buildPersons(content, villageIdByName, rng)
  const membership = buildMembership(personsPlan, content, rng)
  const requests = buildRequests(personsPlan, membership, content, rng, creatorsByVillage)

  return {
    village, user_data, village_grant,
    capability: CAPABILITIES.map(c => ({ id: c.id, name: c.name })),
    disability: membership.disability, vetting_type: membership.vetting_type,
    person: personsPlan.person,
    member: membership.member, volunteer: membership.volunteer,
    volunteer_capability: membership.volunteer_capability,
    volunteer_vetting: membership.volunteer_vetting,
    person_disability: membership.person_disability,
    service_request: requests.service_request,
    notification_event: requests.notification_event,
    fcv_submission: requests.fcv_submission,
  }
}

// Convenience loader of the committed content packs (used by cli.js).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
export function loadContent () {
  const read = (n) => JSON.parse(readFileSync(fileURLToPath(new URL(`../content/${n}`, import.meta.url)), 'utf8'))
  return { people: read('people.json'), services: read('services.json'), destinations: read('destinations.json') }
}
