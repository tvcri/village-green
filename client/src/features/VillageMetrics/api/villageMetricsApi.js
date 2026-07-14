import { apiCall } from '../../../shared/api/apiClient.js'

export const getVillageMetrics = (villageId, start, end) =>
  apiCall('getVillageMetrics', { villageId, start, end })
