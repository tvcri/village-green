import { apiCall } from '../../../shared/api/apiClient.js'

export const getVillages = (elevate) => {
  return apiCall('getVillages', {
    ...(elevate && { elevate }),
    projection: ['personCounts']
  })
}

export const getVillageMembers = (villageId) => apiCall('getVillageMembers', { villageId })

export const getVillageVolunteers = (villageId) => apiCall('getVillageVolunteers', { villageId })

export const getVillageServiceRequests = (villageId, status) =>
  apiCall('getVillageServiceRequests', { villageId, ...(status?.length && { status }) })
