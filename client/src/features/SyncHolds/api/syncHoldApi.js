import { apiCall } from '../../../shared/api/apiClient.js'

// The LGL sync's holds, with the people and staff they mention. state is an
// array (open, dismissed, closed), sent as a repeated param.
export const getSyncHolds = ({ state = ['open'], personId } = {}) =>
  apiCall('getSyncHolds', {
    state,
    projection: ['persons', 'users'],
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
