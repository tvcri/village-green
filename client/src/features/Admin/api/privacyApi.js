import { apiCall } from '../../../shared/api/apiClient.js'

export const getPrivacyRules = () => apiCall('getPrivacyRules')

export const publishPrivacyRules = (content) =>
  apiCall('publishPrivacyRules', {}, { content })

export const patchPrivacyRulesCurrent = (content) =>
  apiCall('patchPrivacyRulesCurrent', {}, { content })

export const createPrivacyAcknowledgement = (rulesId) =>
  apiCall('createPrivacyAcknowledgement', {}, { rulesId })
