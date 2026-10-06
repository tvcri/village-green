'use strict';
const { positions } = require('../service/VolunteerCatalogService')
const SmError = require('../utils/error')
const { hasPermission } = require('../utils/authz')
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

// Per-scope authorization (API spec §4.3 step 3): a village-scoped holder
// needs volunteer:write in that village; Hub and circle need a federation grant.
function canWriteAt (req, scope, villageId) {
  return scope === 'village'
    ? hasPermission(req.userObject, 'volunteer:write', { villageId })
    : hasPermission(req.userObject, 'volunteer:write')
}

module.exports.getPositionHolders = async function getPositionHolders (req, res, next) {
  try {
    const scope = volunteerReadScope(req.userObject)
    if (!(await positions.get(req.params.positionId))) throw new SmError.NotFoundError()
    res.json(await PositionHolderService.listHolders(req.params.positionId, scope))
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
      if (!canWriteAt(req, pos.scope, a.villageId ?? undefined)) throw new SmError.PrivilegeError()
    }
    for (const r of await PositionHolderService.removalRows(positionId, remove)) {
      if (!canWriteAt(req, pos.scope, r.villageId ?? undefined)) throw new SmError.PrivilegeError()
    }
    await PositionHolderService.patchHolders(positionId, { add, remove }, req.userObject.userId)
    res.json(await PositionHolderService.listHolders(positionId, volunteerReadScope(req.userObject)))
  }
  catch (err) { next(err) }
}
