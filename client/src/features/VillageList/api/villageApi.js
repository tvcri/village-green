import { apiCall } from '../../../shared/api/apiClient.js'
import { getPersons } from '../../PersonList/api/personApi.js'

export const getVillages = (elevate, projection = []) => {
  return apiCall('getVillages', {
    ...(elevate && { elevate }),
    ...(projection.length && { projection })
  })
}

export const getVillageMembers = (villageId) =>
  getPersons({ villageId: [villageId], role: 'member' })

export const getVillageVolunteers = (villageId) =>
  getPersons({ villageId: [villageId], role: 'volunteer' })

export const getVillageServiceRequests = (villageId, status) =>
  apiCall('getVillageServiceRequests', { villageId, ...(status?.length && { status }) })
