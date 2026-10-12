import { apiCall } from '../../../shared/api/apiClient.js'

export const getPositions = () => apiCall('getPositions')
export const createPosition = (body) => apiCall('createPosition', {}, body)
export const patchPosition = (positionId, body) => apiCall('patchPosition', { positionId }, body)
export const deletePosition = (positionId) => apiCall('deletePosition', { positionId })
// includeInactive also lists the holders hidden while inactive (honoured for
// volunteer:read_inactive only).
export const getPositionHolders = (positionId, { includeInactive = false } = {}) =>
  apiCall('getPositionHolders', { positionId, ...(includeInactive && { includeInactive: true }) })
export const patchPositionHolders = (positionId, body) => apiCall('patchPositionHolders', { positionId }, body)
