import { apiCall } from '../../../shared/api/apiClient.js'
import { useElevate } from '../../../shared/composables/useElevate.js'
import { getVillages as getVillagesBase } from '../../VillageList/api/villageApi.js'

export const getVillages = () => {
  return getVillagesBase([])
}

export const getVillageGrants = (villageId) => {
  const { elevate } = useElevate()
  return apiCall('getVillageGrants', { villageId, elevate: elevate.value ?? true })
}

export const deleteVillageGrant = (villageId, grantId) => {
  const { elevate } = useElevate()
  return apiCall('deleteVillageGrant', { villageId, grantId, elevate: elevate.value ?? true })
}

export const createVillageGrant = (villageId, grants) => {
  const { elevate } = useElevate()
  return apiCall('createVillageGrant', { villageId, elevate: elevate.value ?? true }, grants)
}
