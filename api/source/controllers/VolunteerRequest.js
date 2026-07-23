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
    const personIds = req.userObject.personIds
    const chosen = req.body?.personId
    // The posted personId writes service_request.volunteerPersonId directly —
    // it must be one of the caller's own resolved persons, never trusted bare.
    if (chosen != null && !personIds.includes(String(chosen))) {
      throw new SmError.PrivilegeError("personId is not one of the caller's volunteers.")
    }
    const { outcome, owningPersonId } = await VolunteerRequestService.signUpVolunteerRequest({
      serviceRequestId,
      personId: chosen,
      personIds,
      userId: req.userObject.userId,
    })
    if (outcome === 'notFound') throw new SmError.NotFoundError()
    if (outcome === 'selectionRequired') {
      throw new SmError.UnprocessableError({ reason: 'selectionRequired', message: 'Multiple volunteers on this account qualify; post personId to choose one.' })
    }
    if (outcome === 'alreadyOwnAccount') {
      // 409 with a machine-readable detail: the client names the committed
      // volunteer from its /user volunteers[] list.
      throw new SmError.ConflictError({ reason: 'alreadyOwnAccount', volunteerPersonId: owningPersonId })
    }
    if (outcome === 'conflict') throw new SmError.ConflictError('Service request is not open for sign-up.')
    // 'confirmed' | 'alreadyOwn': read back after commit (transaction
    // read-back convention). Null is reachable (a concurrent release between
    // commit and read-back drops the row from the caller's visible set) —
    // fail closed like the GET handler, never 200 with a null body.
    const response = await VolunteerRequestService.getVolunteerRequest({ serviceRequestId, personIds })
    if (!response) throw new SmError.NotFoundError()
    res.json(response)
  }
  catch (err) {
    next(err)
  }
}

module.exports.releaseVolunteerRequest = async function releaseVolunteerRequest (req, res, next) {
  try {
    const serviceRequestId = req.params.serviceRequestId
    const personIds = req.userObject.personIds
    const { outcome } = await VolunteerRequestService.releaseVolunteerRequest({
      serviceRequestId,
      personIds,
      userId: req.userObject.userId,
    })
    if (outcome === 'notFound') throw new SmError.NotFoundError()
    if (outcome === 'conflict') throw new SmError.ConflictError("Service request is not this account's confirmed request.")
    // The released row is Open with no owner, so read-back visibility rides on
    // the capability leg alone — null when the caller's capability was revoked
    // after they confirmed. The release itself succeeded; fail closed on the
    // read-back rather than sending 200 with a null body.
    const response = await VolunteerRequestService.getVolunteerRequest({ serviceRequestId, personIds })
    if (!response) throw new SmError.NotFoundError()
    res.json(response)
  }
  catch (err) {
    next(err)
  }
}
