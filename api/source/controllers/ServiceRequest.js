'use strict';

const SmError = require('../utils/error')
const ServiceRequestService = require('../service/ServiceRequestService')
const { hasPermission } = require('../utils/authz')

module.exports.getServiceRequests = async function getServiceRequests (req, res, next) {
  try {
    const status = req.query.status
    const villageId = req.query.villageId
    const hasNotifications = req.query.hasNotifications
    if (villageId?.length) {
      if (!villageId.every(vid => hasPermission(req.userObject, 'sr:read', { villageId: vid }))) {
        throw new SmError.PrivilegeError()
      }
    }
    else if (!hasPermission(req.userObject, 'sr:read')) {
      // No village filter = federation-wide query: requires a federation read.
      throw new SmError.PrivilegeError()
    }
    const villageIdsGranted = hasPermission(req.userObject, 'sr:read')
      ? null // federation read: unrestricted
      : Object.keys(req.userObject.grants).filter(
          vid => hasPermission(req.userObject, 'sr:read', { villageId: vid })
        )
    const response = await ServiceRequestService.getServiceRequests({
      villageIdsGranted,
      status,
      villageId,
      hasNotifications
    })
    res.json(response)
  }
  catch (err) {
    next(err)
  }
}

module.exports.createServiceRequest = async function createServiceRequest (req, res, next) {
  try {
    const body = req.body
    if (!hasPermission(req.userObject, 'sr:write', { villageId: body.villageId })) {
      throw new SmError.PrivilegeError()
    }
    // The service commits in a transaction and returns the new id; fetch the
    // full record afterward so the read sees committed data.
    const serviceRequestId = await ServiceRequestService.createServiceRequest(req.body, req.userObject.userId)
    const response = await ServiceRequestService.getServiceRequest(serviceRequestId)
    res.status(201).json(response)
  }
  catch (err) {
    next(err)
  }
}

module.exports.getServiceRequest = async function getServiceRequest (req, res, next) {
  try {
    const serviceRequestId = req.params.serviceRequestId
    const projections = req.query.projection ?? []
    const response = await ServiceRequestService.getServiceRequest(serviceRequestId, projections)
    if (!response) {
      throw new SmError.NotFoundError()
    }
    if (!hasPermission(req.userObject, 'sr:read', { villageId: response.villageId })) {
      throw new SmError.PrivilegeError()
    }
    res.json(response)
  }
  catch (err) {
    next(err)
  }
}

module.exports.patchServiceRequest = async function patchServiceRequest (req, res, next) {
  try {
    const serviceRequestId = req.params.serviceRequestId

    const existing = await ServiceRequestService.getServiceRequest(serviceRequestId)
    if (!existing) {
      throw new SmError.NotFoundError()
    }
    // Gate on the existing record's village, not the patch body's — the
    // resource being mutated is what determines the required grant.
    if (!hasPermission(req.userObject, 'sr:write', { villageId: existing.villageId })) {
      throw new SmError.PrivilegeError()
    }

    // The service commits in a transaction and returns the id; fetch the full
    // record afterward so the read sees committed data.
    const patched = await ServiceRequestService.patchServiceRequest(serviceRequestId, req.body)
    if (!patched) {
      throw new SmError.NotFoundError()
    }
    const projections = req.query.projection ?? []
    const response = await ServiceRequestService.getServiceRequest(serviceRequestId, projections)
    res.json(response)
  }
  catch (err) {
    next(err)
  }
}

module.exports.deleteServiceRequest = async function deleteServiceRequest (req, res, next) {
  try {
    const serviceRequestId = req.params.serviceRequestId

    const existing = await ServiceRequestService.getServiceRequest(serviceRequestId)
    if (!existing) {
      throw new SmError.NotFoundError()
    }
    if (!hasPermission(req.userObject, 'sr:write', { villageId: existing.villageId })) {
      throw new SmError.PrivilegeError()
    }

    const deleted = await ServiceRequestService.deleteServiceRequest(serviceRequestId)
    if (!deleted) {
      throw new SmError.NotFoundError()
    }
    res.json({})
  }
  catch (err) {
    next(err)
  }
}
