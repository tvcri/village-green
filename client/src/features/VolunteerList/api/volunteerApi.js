import { apiCall } from '../../../shared/api/apiClient.js'

export const getVillageVolunteers = (villageId) => apiCall('getVillageVolunteers', { villageId })
export const getVolunteers = () => apiCall('getVolunteers')
