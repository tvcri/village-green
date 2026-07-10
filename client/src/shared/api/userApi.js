import { apiCall } from './apiClient.js'
import { useElevate } from '../composables/useElevate.js'

export const getUser = () => apiCall('getUser')

export const getUsers = () => {
  const { elevate } = useElevate()
  return apiCall('getUsers', { elevate: elevate.value ?? true })
}

export const getUsersWithGrants = () => {
  const { elevate } = useElevate()
  return apiCall('getUsers', { elevate: elevate.value ?? true, projection: ['grants'] })
}

export const createUser = (body) => {
  const { elevate } = useElevate()
  return apiCall('createUser', { elevate: elevate.value ?? true }, body)
}

export const updateUser = (userId, body) => {
  const { elevate } = useElevate()
  return apiCall('updateUser', { userId, elevate: elevate.value ?? true }, body)
}

export const deleteUser = (userId) => {
  const { elevate } = useElevate()
  return apiCall('deleteUser', { userId, elevate: elevate.value ?? true, projection: ['statistics'] })
}

export const getRoles = () => apiCall('getRoles')

/**
 * Fetches the current user data from the API
 * @returns {Promise<object>} The user object
 */
export async function fetchCurrentUser() {
  return apiCall('getUser', { projection: 'webPreferences' })
}

export function fetchUsers({ status } = {}) {
  const params = {}
  if (status) params.status = status
  return apiCall('getUsers', params)
}

export function fetchUserGroups() {
  return apiCall('getUserGroups')
}
