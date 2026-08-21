import { apiCall } from '../../../shared/api/apiClient.js'

export const getMetaMetrics = (start, end) =>
  apiCall('getMetaMetrics', { start, end })
