import { apiCall } from '../../../shared/api/apiClient.js'

// role is an array (member, volunteer, donor), sent as a repeated param.
// Only defined keys go on the URL: villageId/month/lastGiftWithinYears are
// omitted, not sent as empty strings, when unset. An absent
// lastGiftWithinYears means "any time" to the API.
export const getMailingLabels = ({ audience, role, villageId, month, lastGiftWithinYears }) =>
  apiCall('getMailingLabels', {
    audience,
    role,
    ...(villageId != null && { villageId }),
    ...(month != null && { month }),
    ...(lastGiftWithinYears != null && { lastGiftWithinYears }),
  })
