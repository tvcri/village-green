'use strict';
const { trainings, positions } = require('../service/VolunteerCatalogService')
const SmError = require('../utils/error')
const { hasPermission } = require('../utils/authz')
const TrainingCompletionService = require('../service/TrainingCompletionService')
const volunteerReadScope = require('../utils/volunteerReadScope')

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

module.exports.getTrainingCompletions = async function getTrainingCompletions (req, res, next) {
  try {
    const scope = volunteerReadScope(req.userObject)
    if (!(await trainings.get(req.params.trainingId))) throw new SmError.NotFoundError()
    res.json(await TrainingCompletionService.listCompletions(req.params.trainingId, scope))
  }
  catch (err) { next(err) }
}

module.exports.recordTrainingCompletions = async function recordTrainingCompletions (req, res, next) {
  try {
    const trainingId = req.params.trainingId
    if (!(await trainings.get(trainingId))) throw new SmError.NotFoundError()
    const personIds = req.body.personIds.map(String)
    if (new Set(personIds).size !== personIds.length) throw new SmError.UnprocessableError('A person is listed twice.')
    // Same gate as PATCH /persons/{id}/volunteer, for every person. A Hub
    // position additionally needs a federation-level grant; a village
    // position lands at each person's home village, already gated here.
    for (const p of await TrainingCompletionService.homeVillages(personIds)) {
      if (!hasPermission(req.userObject, 'volunteer:write', { villageId: p.villageId ?? undefined })) throw new SmError.PrivilegeError()
    }
    if (req.body.positionId) {
      const pos = await positions.get(req.body.positionId)
      if (pos?.scope === 'federation' && !hasPermission(req.userObject, 'volunteer:write')) throw new SmError.PrivilegeError()
    }
    const result = await TrainingCompletionService.recordCompletions(trainingId, { ...req.body, personIds }, req.userObject.userId)
    res.json(result)
  }
  catch (err) { next(err) }
}

module.exports.deleteTrainingCompletion = async function deleteTrainingCompletion (req, res, next) {
  try {
    const row = await TrainingCompletionService.getCompletionRow(req.params.trainingId, req.params.volunteerTrainingId)
    if (!row) throw new SmError.NotFoundError()
    if (!hasPermission(req.userObject, 'volunteer:write', { villageId: row.villageId ?? undefined })) throw new SmError.PrivilegeError()
    await TrainingCompletionService.deleteCompletion(row, req.userObject.userId)
    res.status(204).end()
  }
  catch (err) { next(err) }
}
