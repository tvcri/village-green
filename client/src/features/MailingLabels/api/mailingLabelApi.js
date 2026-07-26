import { apiCall } from '../../../shared/api/apiClient.js'

export const getMailingLabelAudiences = () => apiCall('getMailingLabelAudiences')
export const getMailingLabels = (audience) => apiCall('getMailingLabels', { audience })
