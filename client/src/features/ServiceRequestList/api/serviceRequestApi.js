import { apiCall } from '../../../shared/api/apiClient.js'

export const getVillageServiceRequests = (villageId) =>
  apiCall('getVillageServiceRequests', { villageId })
