import { apiCall } from '../../../shared/api/apiClient.js'

export const getTrainings = () => apiCall('getTrainings')
export const createTraining = (body) => apiCall('createTraining', {}, body)
export const patchTraining = (trainingId, body) => apiCall('patchTraining', { trainingId }, body)
export const deleteTraining = (trainingId) => apiCall('deleteTraining', { trainingId })
export const getTrainingCompletions = (trainingId) => apiCall('getTrainingCompletions', { trainingId })
export const recordTrainingCompletions = (trainingId, body) => apiCall('recordTrainingCompletions', { trainingId }, body)
export const deleteTrainingCompletion = (trainingId, volunteerTrainingId) =>
  apiCall('deleteTrainingCompletion', { trainingId, volunteerTrainingId })
