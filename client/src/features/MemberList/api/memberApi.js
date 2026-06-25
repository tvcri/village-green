import { getPersons } from '../../PersonList/api/personApi.js'

export const getVillageMembers = (villageId) =>
  getPersons({ villageId: [villageId], role: 'member' })
