import { apiCall } from '../../../shared/api/apiClient.js'

export const getMetaMetrics = (start, end) =>
  apiCall('getMetaMetrics', { start, end })

// villageId undefined = every village in the caller's scope.
export const getMetaMetricsPersons = (start, end, villageId) =>
  apiCall('getMetaMetricsPersons', villageId === undefined ? { start, end } : { start, end, villageId })
