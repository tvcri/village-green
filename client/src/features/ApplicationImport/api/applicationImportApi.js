import { apiCall } from '../../../shared/api/apiClient.js'

export function extractApplication (file) {
  const formData = new FormData()
  formData.append('importFile', file)
  return apiCall('extractApplication', {}, undefined, { rawBody: formData })
}
