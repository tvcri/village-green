'use strict'

const FcvSyncService = require('../service/FcvSyncService')
const SmError = require('../utils/error')
const { hasPermission } = require('../utils/authz')

// /friends/sync: the JotForm sync's endpoints, and the staff resolution of its
// holds. Checked federation-wide: the sync is not village-scoped.
function assertFcvSync (userObject, access) {
  if (!hasPermission(userObject, `fcv_sync:${access}`)) throw new SmError.PrivilegeError()
}

module.exports.getFcvSyncState = async function (req, res, next) {
  try {
    assertFcvSync(req.userObject, 'read')
    res.json(await FcvSyncService.getState())
  }
  catch (err) { next(err) }
}

module.exports.getFcvSyncSubmissions = async function (req, res, next) {
  try {
    assertFcvSync(req.userObject, 'read')
    res.json(await FcvSyncService.getSubmissions())
  }
  catch (err) { next(err) }
}

module.exports.putFcvSyncSubmission = async function (req, res, next) {
  try {
    assertFcvSync(req.userObject, 'write')
    res.json(await FcvSyncService.putSubmission(req.params.submissionId, req.body))
  }
  catch (err) { next(err) }
}

module.exports.deleteFcvSyncSubmission = async function (req, res, next) {
  try {
    assertFcvSync(req.userObject, 'write')
    await FcvSyncService.deleteSubmission(req.params.submissionId)
    res.status(204).end()
  }
  catch (err) { next(err) }
}

module.exports.getFcvSyncNameMatches = async function (req, res, next) {
  try {
    assertFcvSync(req.userObject, 'read')
    res.json(await FcvSyncService.getNameMatches())
  }
  catch (err) { next(err) }
}

module.exports.putFcvSyncHolds = async function (req, res, next) {
  try {
    assertFcvSync(req.userObject, 'write')
    res.json(await FcvSyncService.putHolds(req.body))
  }
  catch (err) { next(err) }
}

module.exports.getFcvSyncHolds = async function (req, res, next) {
  try {
    assertFcvSync(req.userObject, 'read')
    res.json(await FcvSyncService.getHolds({ state: req.query.state }))
  }
  catch (err) { next(err) }
}

module.exports.createFcvSyncHoldResolution = async function (req, res, next) {
  try {
    assertFcvSync(req.userObject, 'resolve')
    res.json(await FcvSyncService.resolveHold(req.params.holdId, req.body, req.userObject.userId))
  }
  catch (err) { next(err) }
}
