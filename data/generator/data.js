import { makeRng } from './rng.js'
import { CAPABILITIES } from './constants.js'
import { resolveVillages } from './sizing.js'
import { buildVillagesAndUsers } from './builders/villages.js'
import { buildPrivacy } from './builders/privacy.js'
import { buildPersons } from './builders/persons.js'
import { buildMembership } from './builders/membership.js'
import { buildCommunities } from './builders/communities.js'
import { buildVssUsers } from './builders/vss.js'
import { buildRequests } from './builders/requests.js'
import { applyPlants } from './plants.js'

export function buildDataset (content, seed, sizing = {}) {
  const rng = makeRng(seed)
  const villagesList = resolveVillages(sizing)
  const { village, user_data, role_grant, villageIdByName, creatorUserIds } =
    buildVillagesAndUsers(content, rng, villagesList)
  // requests builder needs villageId -> name; pass via a private field
  content.__villageById = Object.fromEntries(village.map(v => [v.id, v.name]))

  const personsPlan = buildPersons(content, villageIdByName, rng, villagesList)
  const membership = buildMembership(personsPlan, content, rng)
  const communities = buildCommunities(personsPlan, membership, rng, villagesList, villageIdByName)
  const vss = buildVssUsers(personsPlan, membership, user_data, rng)
  const privacy = buildPrivacy(user_data, rng)
  const requests = buildRequests(personsPlan, membership, content, rng, creatorUserIds, vss.userIdByPersonId)

  const dataset = {
    village, user_data, role_grant,
    privacy_rules: privacy.privacy_rules, privacy_acknowledgement: privacy.privacy_acknowledgement,
    capability: CAPABILITIES.map(c => ({ id: c.id, name: c.name })),
    disability: membership.disability, vetting_type: membership.vetting_type, community: communities.community,
    person: personsPlan.person,
    member: membership.member, volunteer: membership.volunteer,
    volunteer_capability: membership.volunteer_capability,
    volunteer_vetting: membership.volunteer_vetting,
    person_disability: membership.person_disability, person_community: communities.person_community,
    service_request: requests.service_request,
    notification_event: requests.notification_event,
    fcv_submission: requests.fcv_submission,
  }

  const plants = applyPlants(dataset, rng)
  dataset.__meta = { plants, villagesList, gagIndex: requests.gagIndex }

  return dataset
}

// Convenience loader of the committed content packs (used by cli.js).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
export function loadContent () {
  const read = (n) => JSON.parse(readFileSync(fileURLToPath(new URL(`../content/${n}`, import.meta.url)), 'utf8'))
  return { people: read('people.json'), services: read('services.json'), destinations: read('destinations.json') }
}
