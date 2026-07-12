import { apiCall } from '../../../shared/api/apiClient.js'

export const getVillage = (villageId) => {
  return apiCall('getVillage', {
    villageId,
    projection: ['personCounts', 'capabilityCounts']
  })
}
