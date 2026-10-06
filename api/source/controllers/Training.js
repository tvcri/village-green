'use strict';
const { trainings } = require('../service/VolunteerCatalogService')
const SmError = require('../utils/error')
const { hasPermission } = require('../utils/authz')

function requireAdmin (req) {
  if (!hasPermission(req.userObject, 'training:admin')) throw new SmError.PrivilegeError()
}

module.exports.getTrainings = async function getTrainings (req, res, next) {
  try { res.json(await trainings.list()) }
  catch (err) { next(err) }
}

module.exports.createTraining = async function createTraining (req, res, next) {
  try {
    requireAdmin(req)
    const id = await trainings.create(req.body, req.userObject.userId)
    res.status(201).json(await trainings.get(id))
  }
  catch (err) { next(err) }
}

module.exports.patchTraining = async function patchTraining (req, res, next) {
  try {
    requireAdmin(req)
    const id = req.params.trainingId
    if (!(await trainings.get(id))) throw new SmError.NotFoundError()
    await trainings.patch(id, req.body, req.userObject.userId)
    res.json(await trainings.get(id))
  }
  catch (err) { next(err) }
}

module.exports.deleteTraining = async function deleteTraining (req, res, next) {
  try {
    requireAdmin(req)
    const id = req.params.trainingId
    if (!(await trainings.get(id))) throw new SmError.NotFoundError()
    await trainings.remove(id, req.userObject.userId)
    res.status(204).end()
  }
  catch (err) { next(err) }
}
