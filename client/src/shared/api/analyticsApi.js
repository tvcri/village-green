import { apiCall } from './apiClient.js'
import { useElevate } from '../composables/useElevate.js'

export function postAnalyticsEvents(events) {
  return apiCall('postEvents', {}, events)
}

export function getAnalyticsSummary({ from, to, userId } = {}) {
  // getSummary is x-elevation-required: without elevate the API answers 403
  // ("Request requires parameter elevate=true"), so default it on the way
  // other admin-only calls do.
  const { elevate } = useElevate()
  const params = { elevate: elevate.value ?? true }
  if (from) params.from = from
  if (to) params.to = to
  if (userId) params.userId = userId
  return apiCall('getSummary', params)
}
