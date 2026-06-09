import { getVillages as getVillagesBase } from '../../VillageList/api/villageApi.js'

export const getVillages = () => {
  return getVillagesBase(true)
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
