import { apiCall } from '../../../shared/api/apiClient.js'

export const getFriends = ({ villageId, volunteerName, memberName, dateStart, dateEnd, contactType, activityType } = {}) => {
  const params = {}
  if (villageId) params.villageId = [villageId]
  if (volunteerName) params.volunteerName = volunteerName
  if (memberName) params.memberName = memberName
  if (dateStart) params.dateStart = dateStart
  if (dateEnd) params.dateEnd = dateEnd
  if (contactType) params.contactType = contactType
  if (activityType) params.activityType = activityType
  return apiCall('getFriends', params)
}
