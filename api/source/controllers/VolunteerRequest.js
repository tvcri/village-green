'use strict'

const SmError = require('../utils/error')
const VolunteerRequestService = require('../service/VolunteerRequestService')

module.exports.getVolunteerRequestVillages = async function getVolunteerRequestVillages (req, res, next) {
  try {
    const response = await VolunteerRequestService.getVolunteerRequestVillages()
    res.json(response)
  }
  catch (err) {
    next(err)
  }
}

module.exports.getVolunteerRequests = async function getVolunteerRequests (req, res, next) {
  try {
    const response = await VolunteerRequestService.getVolunteerRequests({
      scope: req.query.scope,
      personIds: req.userObject.personIds,
    })
    res.json(response)
  }
  catch (err) {
    next(err)
  }
}

module.exports.getVolunteerRequest = async function getVolunteerRequest (req, res, next) {
  try {
    const response = await VolunteerRequestService.getVolunteerRequest({
      serviceRequestId: req.params.serviceRequestId,
      personIds: req.userObject.personIds,
    })
    if (!response) throw new SmError.NotFoundError()
    res.json(response)
  }
  catch (err) {
    next(err)
  }
}

module.exports.signUpVolunteerRequest = async function signUpVolunteerRequest (req, res, next) {
  try {
    const serviceRequestId = req.params.serviceRequestId
    const { outcome } = await VolunteerRequestService.signUpVolunteerRequest({
      serviceRequestId,
      personId: req.userObject.personId,
      userId: req.userObject.userId,
    })
    if (outcome === 'notFound') throw new SmError.NotFoundError()
    if (outcome === 'conflict') throw new SmError.ConflictError('Service request is not open for sign-up.')
    // 'confirmed' | 'alreadyOwn': read back after commit (transaction
    // read-back convention).
    const response = await VolunteerRequestService.getVolunteerRequest({
      serviceRequestId,
      personId: req.userObject.personId,
    })
    res.json(response)
  }
  catch (err) {
    next(err)
  }
}

module.exports.releaseVolunteerRequest = async function releaseVolunteerRequest (req, res, next) {
  try {
    const serviceRequestId = req.params.serviceRequestId
    const { outcome } = await VolunteerRequestService.releaseVolunteerRequest({
      serviceRequestId,
      personId: req.userObject.personId,
      userId: req.userObject.userId,
    })
    if (outcome === 'notFound') throw new SmError.NotFoundError()
    if (outcome === 'conflict') throw new SmError.ConflictError('Service request is not this volunteer\'s confirmed request.')
    const response = await VolunteerRequestService.getVolunteerRequest({
      serviceRequestId,
      personId: req.userObject.personId,
    })
    res.json(response)
  }
  catch (err) {
    next(err)
  }
}
