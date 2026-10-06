'use strict';
const { positions } = require('../service/VolunteerCatalogService')
const SmError = require('../utils/error')
const { hasPermission } = require('../utils/authz')

function requireAdmin (req) {
  if (!hasPermission(req.userObject, 'position:admin')) throw new SmError.PrivilegeError()
}

module.exports.getPositions = async function getPositions (req, res, next) {
  try { res.json(await positions.list()) }
  catch (err) { next(err) }
}

module.exports.createPosition = async function createPosition (req, res, next) {
  try {
    requireAdmin(req)
    const id = await positions.create(req.body, req.userObject.userId)
    res.status(201).json(await positions.get(id))
  }
  catch (err) { next(err) }
}

module.exports.patchPosition = async function patchPosition (req, res, next) {
  try {
    requireAdmin(req)
    const id = req.params.positionId
    if (!(await positions.get(id))) throw new SmError.NotFoundError()
    await positions.patch(id, req.body, req.userObject.userId)
    res.json(await positions.get(id))
  }
  catch (err) { next(err) }
}

module.exports.deletePosition = async function deletePosition (req, res, next) {
  try {
    requireAdmin(req)
    const id = req.params.positionId
    if (!(await positions.get(id))) throw new SmError.NotFoundError()
    await positions.remove(id, req.userObject.userId)
    res.status(204).end()
  }
  catch (err) { next(err) }
}
