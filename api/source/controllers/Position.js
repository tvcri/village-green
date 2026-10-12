'use strict';
const { positions } = require('../service/VolunteerCatalogService')
const SmError = require('../utils/error')
const { hasPermission, canWritePosition } = require('../utils/authz')
const PositionHolderService = require('../service/PositionHolderService')
const volunteerReadScope = require('../utils/volunteerReadScope')

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

module.exports.getPositionHolders = async function getPositionHolders (req, res, next) {
  try {
    const scope = volunteerReadScope(req.userObject)
    if (!(await positions.get(req.params.positionId))) throw new SmError.NotFoundError()
    res.json(await PositionHolderService.listHolders(req.params.positionId, scope,
      { includeInactive: req.query.includeInactive === true && scope.includeInactive }))
  }
  catch (err) { next(err) }
}

module.exports.patchPositionHolders = async function patchPositionHolders (req, res, next) {
  try {
    const positionId = req.params.positionId
    const pos = await positions.get(positionId)
    if (!pos) throw new SmError.NotFoundError()
    const add = req.body.add ?? []
    const remove = req.body.remove ?? []
    for (const a of add) {
      if (!canWritePosition(req.userObject, pos.scope, a.villageId ?? undefined)) throw new SmError.PrivilegeError()
    }
    for (const r of await PositionHolderService.removalRows(positionId, remove)) {
      if (!canWritePosition(req.userObject, pos.scope, r.villageId ?? undefined)) throw new SmError.PrivilegeError()
    }
    await PositionHolderService.patchHolders(positionId, { add, remove }, req.userObject.userId)
    res.json(await PositionHolderService.listHolders(positionId, volunteerReadScope(req.userObject)))
  }
  catch (err) { next(err) }
}
