import { apiCall } from '../../../shared/api/apiClient.js'

export const getVillageVolunteers = (villageId) => apiCall('getVillageVolunteers', { villageId })
export const getVolunteers = () => apiCall('getVolunteers')

// The Hub name searches: inactive volunteers included (they train before
// activation), with village and associate villages (UI spec §2.4).
export const getVolunteerRoster = () => apiCall('getVolunteers', { includeInactive: true })
