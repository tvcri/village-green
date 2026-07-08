import { apiCall } from '../../../shared/api/apiClient.js'

export const getVolunteerRequests = (scope) =>
  apiCall('getVolunteerRequests', { scope })

export const pickupVolunteerRequest = (serviceRequestId) =>
  apiCall('pickupVolunteerRequest', { serviceRequestId })

export const releaseVolunteerRequest = (serviceRequestId) =>
  apiCall('releaseVolunteerRequest', { serviceRequestId })
