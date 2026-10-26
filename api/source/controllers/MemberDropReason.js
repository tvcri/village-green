'use strict';
const { memberDropReasons } = require('../service/VolunteerCatalogService')
const SmError = require('../utils/error')
const { hasPermission } = require('../utils/authz')

function requireAdmin (req) {
  if (!hasPermission(req.userObject, 'drop_reason:admin')) throw new SmError.PrivilegeError()
}

module.exports.getMemberDropReasons = async function getMemberDropReasons (req, res, next) {
  try { res.json(await memberDropReasons.list()) }
  catch (err) { next(err) }
}

module.exports.createMemberDropReason = async function createMemberDropReason (req, res, next) {
  try {
    requireAdmin(req)
    const id = await memberDropReasons.create(req.body, req.userObject.userId)
    res.status(201).json(await memberDropReasons.get(id))
  }
  catch (err) { next(err) }
}

module.exports.patchMemberDropReason = async function patchMemberDropReason (req, res, next) {
  try {
    requireAdmin(req)
    const id = req.params.memberDropReasonId
    if (!(await memberDropReasons.get(id))) throw new SmError.NotFoundError()
    await memberDropReasons.patch(id, req.body, req.userObject.userId)
    res.json(await memberDropReasons.get(id))
  }
  catch (err) { next(err) }
}

module.exports.deleteMemberDropReason = async function deleteMemberDropReason (req, res, next) {
  try {
    requireAdmin(req)
    const id = req.params.memberDropReasonId
    if (!(await memberDropReasons.get(id))) throw new SmError.NotFoundError()
    await memberDropReasons.remove(id, req.userObject.userId)
    res.status(204).end()
  }
  catch (err) { next(err) }
}
