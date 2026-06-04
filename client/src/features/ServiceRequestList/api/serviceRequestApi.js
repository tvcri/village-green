import { apiCall } from '../../../shared/api/apiClient.js'

export const getVillageServiceRequests = (villageId, status) =>
  apiCall('getVillageServiceRequests', { villageId, ...(status?.length && { status }) })
