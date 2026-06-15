import { apiCall } from '../../../shared/api/apiClient.js'

export const getVillageServiceRequests = (villageId) =>
  apiCall('getVillageServiceRequests', { villageId })

export const getServiceRequest = (serviceRequestId, projection = []) =>
  apiCall('getServiceRequest', { serviceRequestId, ...(projection.length && { projection }) })
