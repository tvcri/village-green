import { apiCall } from '../../../shared/api/apiClient.js'

export const getUsers = () => {
  return apiCall('getUsers', { elevate: true })
}

export const getUserGrants = (userId) => {
  return apiCall('getUserGrants', { userId, elevate: true })
}

export const deleteUserGrant = (userId, grantId) => {
  return apiCall('deleteUserGrant', { userId, grantId, elevate: true })
}

export const createUserGrant = (userId, grants) => {
  return apiCall('createUserGrant', { userId, elevate: true }, grants)
}
