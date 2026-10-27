'use strict';
const { volunteerDropReasons } = require('../service/VolunteerCatalogService')
const SmError = require('../utils/error')
const { hasPermission } = require('../utils/authz')

function requireAdmin (req) {
  if (!hasPermission(req.userObject, 'drop_reason:admin')) throw new SmError.PrivilegeError()
}

module.exports.getVolunteerDropReasons = async function getVolunteerDropReasons (req, res, next) {
  try { res.json(await volunteerDropReasons.list()) }
  catch (err) { next(err) }
}

module.exports.createVolunteerDropReason = async function createVolunteerDropReason (req, res, next) {
  try {
    requireAdmin(req)
    const id = await volunteerDropReasons.create(req.body, req.userObject.userId)
    res.status(201).json(await volunteerDropReasons.get(id))
  }
  catch (err) { next(err) }
}

module.exports.patchVolunteerDropReason = async function patchVolunteerDropReason (req, res, next) {
  try {
    requireAdmin(req)
    const id = req.params.volunteerDropReasonId
    if (!(await volunteerDropReasons.get(id))) throw new SmError.NotFoundError()
    await volunteerDropReasons.patch(id, req.body, req.userObject.userId)
    res.json(await volunteerDropReasons.get(id))
  }
  catch (err) { next(err) }
}

module.exports.deleteVolunteerDropReason = async function deleteVolunteerDropReason (req, res, next) {
  try {
    requireAdmin(req)
    const id = req.params.volunteerDropReasonId
    if (!(await volunteerDropReasons.get(id))) throw new SmError.NotFoundError()
    await volunteerDropReasons.remove(id, req.userObject.userId)
    res.status(204).end()
  }
  catch (err) { next(err) }
}
