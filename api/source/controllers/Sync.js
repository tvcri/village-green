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

module.exports.getSyncFields = async function getSyncFields (req, res, next) {
  try {
    assertSync(req.userObject, 'read')
    res.json(await SyncService.getFields({ personIds: req.query.personId }))
  }
  catch (err) { next(err) }
}

module.exports.putSyncFields = async function putSyncFields (req, res, next) {
  try {
    assertSync(req.userObject, 'write')
    res.json(await SyncService.putFields(req.body))
  }
  catch (err) { next(err) }
}

module.exports.getSyncHolds = async function getSyncHolds (req, res, next) {
  try {
    assertSync(req.userObject, 'read')
    const { state, personId, lglConstituentId } = req.query
    res.json(await SyncService.getHolds({ states: state, personId, lglConstituentId }))
  }
  catch (err) { next(err) }
}

module.exports.createSyncHolds = async function createSyncHolds (req, res, next) {
  try {
    assertSync(req.userObject, 'write')
    res.json(await SyncService.createHolds(req.body, req.userObject.userId))
  }
  catch (err) { next(err) }
}

module.exports.patchSyncHolds = async function patchSyncHolds (req, res, next) {
  try {
    assertSync(req.userObject, 'write')
    res.json(await SyncService.patchHolds(req.body))
  }
  catch (err) { next(err) }
}

module.exports.createSyncHoldDismissal = async function createSyncHoldDismissal (req, res, next) {
  try {
    assertSync(req.userObject, 'write')
    res.json(await SyncService.dismissHold(req.params.holdId, req.body, req.userObject.userId))
  }
  catch (err) { next(err) }
}
