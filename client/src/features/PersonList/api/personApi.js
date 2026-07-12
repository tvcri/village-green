import { apiCall } from '../../../shared/api/apiClient.js'

export const getPersons = ({ villageId, firstName, lastName, phone, email } = {}) => {
  const params = {}
  if (villageId?.length) params.villageId = villageId
  if (firstName) params.firstName = firstName
  if (lastName) params.lastName = lastName
  if (phone) params.phone = phone
  if (email) params.email = email
  return apiCall('getPersons', params)
}

export const getPerson = (personId, projection = []) =>
  apiCall('getPerson', { personId, projection })

export const createPerson = (body) => apiCall('createPerson', {}, body)

export const patchPerson = (personId, body) =>
  apiCall('patchPerson', { personId }, body)

export const deletePerson = (personId) => apiCall('deletePerson', { personId })

// Lookups (Plan A Task 8.5): full lists for id<->name resolution.
export const getCommunities  = () => apiCall('getCommunities')
export const getCapabilities = () => apiCall('getCapabilities')
export const getDisabilities = () => apiCall('getDisabilities')
export const getVettingTypes = () => apiCall('getVettingTypes')
