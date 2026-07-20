import { apiCall } from '../../../shared/api/apiClient.js'

export const getVolunteerRequestVillages = () =>
  apiCall('getVolunteerRequestVillages')

export const getVolunteerRequests = (scope) =>
  apiCall('getVolunteerRequests', { scope })

export const getVolunteerRequest = (serviceRequestId) =>
  apiCall('getVolunteerRequest', { serviceRequestId })

export const signUpVolunteerRequest = (serviceRequestId) =>
  apiCall('signUpVolunteerRequest', { serviceRequestId })

export const releaseVolunteerRequest = (serviceRequestId) =>
  apiCall('releaseVolunteerRequest', { serviceRequestId })
