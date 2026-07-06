import { apiCall } from '../../../shared/api/apiClient.js'

export const putMember    = (personId, body) => apiCall('putPersonMember', { personId }, body)
export const patchMember  = (personId, body) => apiCall('patchPersonMember', { personId }, body)
export const deleteMember = (personId)        => apiCall('deletePersonMember', { personId })

export const putVolunteer    = (personId, body) => apiCall('putPersonVolunteer', { personId }, body)
export const patchVolunteer  = (personId, body) => apiCall('patchPersonVolunteer', { personId }, body)
export const deleteVolunteer = (personId)        => apiCall('deletePersonVolunteer', { personId })
