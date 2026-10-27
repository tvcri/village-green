import { apiCall } from '../../../shared/api/apiClient.js'

export const getMemberDropReasons = () => apiCall('getMemberDropReasons')
export const createMemberDropReason = (body) => apiCall('createMemberDropReason', {}, body)
export const patchMemberDropReason = (memberDropReasonId, body) =>
  apiCall('patchMemberDropReason', { memberDropReasonId }, body)
export const deleteMemberDropReason = (memberDropReasonId) =>
  apiCall('deleteMemberDropReason', { memberDropReasonId })
