import { apiCall } from '../../../shared/api/apiClient.js'

// Normalize each row with a single numeric `displayNumber` for the "#" column:
// legacy `requestNumber` if set, else the VG-created `serviceRequestId` as a
// number. Using `??` (not `||`) preserves a legitimate requestNumber of 0 and
// closes the undefined/NaN hole. Lets DataTable sort on one real field.
export const withDisplayNumber = (rows) =>
  (Array.isArray(rows) ? rows : []).map((r) => ({
    ...r,
    displayNumber: r.requestNumber ?? Number(r.serviceRequestId),
  }))

export const getVillageServiceRequests = (villageId) =>
  apiCall('getVillageServiceRequests', { villageId }).then(withDisplayNumber)

export const getServiceRequest = (serviceRequestId, projection = []) =>
  apiCall('getServiceRequest', { serviceRequestId, ...(projection.length && { projection }) })

export const getServiceRequests = ({ status, villageId, hasNotifications } = {}) => {
  const params = {}
  if (status?.length) params.status = status
  if (villageId?.length) params.villageId = villageId
  if (hasNotifications === false) params.hasNotifications = false
  return apiCall('getServiceRequests', params).then(withDisplayNumber)
}

export const createServiceRequest = (payload) =>
  apiCall('createServiceRequest', payload)

export const updateServiceRequest = (serviceRequestId, payload) =>
  apiCall('patchServiceRequest', { serviceRequestId, ...payload })
