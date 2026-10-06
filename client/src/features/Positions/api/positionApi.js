import { apiCall } from '../../../shared/api/apiClient.js'

export const getPositions = () => apiCall('getPositions')
export const createPosition = (body) => apiCall('createPosition', {}, body)
export const patchPosition = (positionId, body) => apiCall('patchPosition', { positionId }, body)
export const deletePosition = (positionId) => apiCall('deletePosition', { positionId })
export const getPositionHolders = (positionId) => apiCall('getPositionHolders', { positionId })
export const patchPositionHolders = (positionId, body) => apiCall('patchPositionHolders', { positionId }, body)
