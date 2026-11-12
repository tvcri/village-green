'use strict';

const SyncService = require('../service/SyncService')
const SmError = require('../utils/error')
const { hasPermission } = require('../utils/authz')

// /sync: the vg-sync service account's endpoints. No UI calls them. Checked
// federation-wide: the sync is not village-scoped.
function assertSync (userObject, access) {
  if (!hasPermission(userObject, access === 'write' ? 'sync:write' : 'sync:read')) {
    throw new SmError.PrivilegeError()
  }
}

module.exports.getSyncChanges = async function getSyncChanges (req, res, next) {
  try {
    assertSync(req.userObject, 'read')
    const { after, limit = 1000 } = req.query
    res.json(await SyncService.getChanges({ after, limit }))
  }
  catch (err) { next(err) }
}
