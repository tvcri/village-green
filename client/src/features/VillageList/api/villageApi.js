import { apiCall } from '../../../shared/api/apiClient.js'

export const getVillages = (projection = []) => {
  return apiCall('getVillages', {
    ...(projection.length && { projection })
  })
}

export const getVillageMembers = (villageId) => apiCall('getVillageMembers', { villageId })

export const getVillageVolunteers = (villageId) => apiCall('getVillageVolunteers', { villageId })

export const getVillageServiceRequests = (villageId, { status, serviceDateStart, serviceDateEnd } = {}) =>
  apiCall('getVillageServiceRequests', {
    villageId,
    ...(status?.length && { status }),
    ...(serviceDateStart && { serviceDateStart }),
    ...(serviceDateEnd && { serviceDateEnd })
  })
