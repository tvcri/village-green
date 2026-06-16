import { apiCall } from './apiClient.js'

export function postAnalyticsEvents(events) {
  return apiCall('postEvents', {}, events)
}

export function getAnalyticsSummary({ from, to, userId } = {}) {
  const params = {}
  if (from) params.from = from
  if (to) params.to = to
  if (userId) params.userId = userId
  return apiCall('getSummary', params)
}
