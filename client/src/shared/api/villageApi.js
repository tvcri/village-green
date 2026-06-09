import { apiCall } from './apiClient.js'

export const getVillagePerson = (villageId, personId) =>
  apiCall('getVillagePerson', { villageId, personId })

export const getVillagePersons = (villageId) =>
  apiCall('getVillagePersons', { villageId })
