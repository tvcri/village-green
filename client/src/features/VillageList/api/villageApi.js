import { apiCall } from '../../../shared/api/apiClient.js'
import { useElevate } from '../../../shared/composables/useElevate.js'

export const getVillages = () => {
  const { elevate } = useElevate()
  return apiCall('getVillages', {
    ...(elevate.value && { elevate: elevate.value }),
    projection: ['personCounts']
  })
}

export const getUserVillages = () => {
  return apiCall('getVillages', {
    projection: ['personCounts']
  })
}

export const getVillageMembers = (villageId) => apiCall('getVillageMembers', { villageId })

export const getVillageVolunteers = (villageId) => apiCall('getVillageVolunteers', { villageId })

export const getVillageServiceRequests = (villageId, status) =>
  apiCall('getVillageServiceRequests', { villageId, ...(status?.length && { status }) })
