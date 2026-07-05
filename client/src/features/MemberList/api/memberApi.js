import { apiCall } from '../../../shared/api/apiClient.js'

export const getVillageMembers = (villageId) => apiCall('getVillageMembers', { villageId })
