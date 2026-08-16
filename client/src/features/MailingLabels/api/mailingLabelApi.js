import { apiCall } from '../../../shared/api/apiClient.js'

// Only defined keys go on the URL: villageId/month are omitted, not sent
// as empty strings, when unset.
export const getMailingLabels = ({ audience, role, villageId, month }) =>
  apiCall('getMailingLabels', {
    audience,
    role,
    ...(villageId != null && { villageId }),
    ...(month != null && { month }),
  })
