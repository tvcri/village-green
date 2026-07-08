'use strict'

const SmError = require('../utils/error')
const VolunteerRequestService = require('../service/VolunteerRequestService')

module.exports.getVolunteerRequests = async function getVolunteerRequests (req, res, next) {
  try {
    const response = await VolunteerRequestService.getVolunteerRequests({
      scope: req.query.scope,
      personId: req.userObject.personId,
      villageIds: req.volunteerVillageIds,
    })
    res.json(response)
  }
  catch (err) {
    next(err)
  }
}

module.exports.pickupVolunteerRequest = async function pickupVolunteerRequest (req, res, next) {
  try {
    const serviceRequestId = req.params.serviceRequestId
    const { outcome } = await VolunteerRequestService.pickupVolunteerRequest({
      serviceRequestId,
      personId: req.userObject.personId,
      userId: req.userObject.userId,
      villageIds: req.volunteerVillageIds,
    })
    if (outcome === 'notFound') throw new SmError.NotFoundError()
    if (outcome === 'conflict') throw new SmError.ConflictError('Service request is not open for pickup.')
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
      villageIds: req.volunteerVillageIds,
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
