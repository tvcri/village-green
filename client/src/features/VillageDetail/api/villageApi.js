import { apiCall } from '../../../shared/api/apiClient.js'
import { useElevate } from '../../../shared/composables/useElevate.js'

export const getVillage = (villageId) => {
  const { elevate } = useElevate()
  return apiCall('getVillage', {
    villageId,
    projection: ['personCounts', 'capabilityCounts'],
    ...(elevate.value && { elevate: elevate.value })
  })
}
