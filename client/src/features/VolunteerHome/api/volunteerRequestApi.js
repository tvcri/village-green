import { apiCall } from '../../../shared/api/apiClient.js'

export const getVolunteerRequestVillages = () =>
  apiCall('getVolunteerRequestVillages')

export const getVolunteerRequests = (scope) =>
  apiCall('getVolunteerRequests', { scope })

export const getVolunteerRequest = (serviceRequestId) =>
  apiCall('getVolunteerRequest', { serviceRequestId })

export const signUpVolunteerRequest = (serviceRequestId, personId) =>
  apiCall('signUpVolunteerRequest', { serviceRequestId }, personId ? { personId } : undefined)

export const releaseVolunteerRequest = (serviceRequestId) =>
  apiCall('releaseVolunteerRequest', { serviceRequestId })
