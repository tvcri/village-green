import { apiCall } from '../../../shared/api/apiClient.js'

// The LGL sync's holds, by default with the people and staff they mention
// (projection: [] for a bare count). state is an array (open, dismissed,
// closed), sent as a repeated param.
export const getSyncHolds = ({ state = ['open'], personId, projection = ['persons', 'users'] } = {}) =>
  apiCall('getSyncHolds', {
    state,
    ...(projection.length && { projection }),
    ...(personId != null && { personId }),
  })

// "Mark as seen" and "Don't add this donor".
export const dismissSyncHold = (holdId, note) =>
  apiCall('createSyncHoldDismissal', { holdId }, { dismissalKind: 'staff', ...(note && { note }) })

// "This is…" ({ kind: 'link', personId }) and "New person" ({ kind: 'create' }).
export const resolveSyncHold = (holdId, { kind, personId }) =>
  apiCall('createSyncHoldResolution', { holdId }, kind === 'link' ? { kind, personId } : { kind })

// "Done in LGL".
export const closeSyncHold = (holdId) =>
  apiCall('createSyncHoldClosure', { holdId }, {})
