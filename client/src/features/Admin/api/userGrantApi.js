import { apiCall } from '../../../shared/api/apiClient.js'
import { useElevate } from '../../../shared/composables/useElevate.js'

export const getUsers = () => {
  const { elevate } = useElevate()
  return apiCall('getUsers', { elevate: elevate.value ?? true, projection: ['volunteer'] })
}

export const getUserGrants = (userId) => {
  const { elevate } = useElevate()
  return apiCall('getUserGrants', { userId, elevate: elevate.value ?? true })
}

export const deleteUserGrant = (userId, grantId) => {
  const { elevate } = useElevate()
  return apiCall('deleteUserGrant', { userId, grantId, elevate: elevate.value ?? true })
}

export const createUserGrant = (userId, grants) => {
  const { elevate } = useElevate()
  return apiCall('createUserGrant', { userId, elevate: elevate.value ?? true }, grants)
}
