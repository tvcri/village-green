import { apiCall } from '../../../shared/api/apiClient.js'

export const getVillageServiceRequests = (villageId) =>
  apiCall('getVillageServiceRequests', { villageId })

export const getServiceRequest = (serviceRequestId, projection = []) =>
  apiCall('getServiceRequest', { serviceRequestId, ...(projection.length && { projection }) })

export const getServiceRequests = ({ status, villageId } = {}) => {
  const params = {}
  if (status?.length) params.status = status
  if (villageId?.length) params.villageId = villageId
  return apiCall('getServiceRequests', params)
}
