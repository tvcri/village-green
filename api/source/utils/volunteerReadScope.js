'use strict'
const SmError = require('./error')
const { hasPermission } = require('./authz')

// Who may read volunteer rows, and which ones (UI spec §2.4). A federation
// volunteer:read sees every row (villageIdsGranted null); a village-level
// holder sees rows whose person's home village they are granted. Inactive
// volunteers ride along only for a federation volunteer:read_inactive
// holder, matching the volunteer projection.
module.exports = function volunteerReadScope (userObject) {
  const villageIdsGranted = hasPermission(userObject, 'volunteer:read')
    ? null
    : Object.keys(userObject.grants ?? {}).filter(
        vid => hasPermission(userObject, 'volunteer:read', { villageId: vid }))
  if (villageIdsGranted && !villageIdsGranted.length) throw new SmError.PrivilegeError()
  return { villageIdsGranted, includeInactive: hasPermission(userObject, 'volunteer:read_inactive') }
}
