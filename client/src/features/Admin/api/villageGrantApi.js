import { apiCall } from '../../../shared/api/apiClient.js'

export const getVillages = () => {
  return apiCall('getVillages', { elevate: true })
}

export const getVillageGrants = (villageId) => {
  return apiCall('getVillageGrants', { villageId, elevate: true })
}

export const deleteVillageGrant = (villageId, grantId) => {
  return apiCall('deleteVillageGrant', { villageId, grantId, elevate: true })
}

export const createVillageGrant = (villageId, grants) => {
  return apiCall('createVillageGrant', { villageId, elevate: true }, grants)
}
