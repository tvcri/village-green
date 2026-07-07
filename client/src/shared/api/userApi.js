import { apiCall } from './apiClient.js'

export const getUser = () => apiCall('getUser')

export const getUsers = () => apiCall('getUsers', { elevate: true })

export const getUsersWithGrants = () =>
  apiCall('getUsers', { elevate: true, projection: ['villageGrants', 'statistics'] })

export const createUser = (body) =>
  apiCall('createUser', { elevate: true }, body)

export const updateUser = (userId, body) =>
  apiCall('updateUser', { userId, elevate: true }, body)

export const deleteUser = (userId) =>
  apiCall('deleteUser', { userId, elevate: true })

/**
 * Fetches the current user data from the API
 * @returns {Promise<object>} The user object with sorted collectionGrants
 */
export async function fetchCurrentUser() {
  const user = await apiCall('getUser', { projection: 'webPreferences' })

  // Sort collectionGrants by collection name (matching original SM.GetUserObject logic)
  if (user.collectionGrants && Array.isArray(user.collectionGrants)) {
    user.collectionGrants.sort((a, b) => {
      const nameA = a.collection.name
      const nameB = b.collection.name
      if (nameA < nameB) {
        return -1
      }
      if (nameA > nameB) {
        return 1
      }
      return 0
    })
  }

  return user
}

export function fetchUsers({ status } = {}) {
  const params = {}
  if (status) params.status = status
  return apiCall('getUsers', params)
}

export function fetchUserGroups() {
  return apiCall('getUserGroups')
}
