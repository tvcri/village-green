import { getPersons } from '../../PersonList/api/personApi.js'

export const getVillageVolunteers = (villageId) =>
  getPersons({ villageId: [villageId], role: 'volunteer' })
