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
