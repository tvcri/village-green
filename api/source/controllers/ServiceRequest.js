'use strict';

const SmError = require('../utils/error')
const ServiceRequestService = require('../service/ServiceRequestService')

module.exports.getServiceRequests = async function getServiceRequests (req, res, next) {
  try {
    const elevate = req.query.elevate
    if (elevate && !req.userObject.privileges?.admin) {
      throw new SmError.PrivilegeError()
    }
    const status = req.query.status
    const villageId = req.query.villageId
    const villageIdsGranted = Object.keys(req.userObject.grants)
    const response = await ServiceRequestService.getServiceRequests({
      villageIdsGranted,
      elevate,
      status,
      villageId
    })
    res.json(response)
  }
  catch (err) {
    next(err)
  }
}

module.exports.createServiceRequest = async function createServiceRequest (req, res, next) {
  try {
    // The service commits in a transaction and returns the new id; fetch the
    // full record afterward so the read sees committed data.
    const serviceRequestId = await ServiceRequestService.createServiceRequest(req.body)
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
    res.json(response)
  }
  catch (err) {
    next(err)
  }
}

module.exports.patchServiceRequest = async function patchServiceRequest (req, res, next) {
  try {
    const serviceRequestId = req.params.serviceRequestId
    // The service commits in a transaction and returns the id; fetch the full
    // record afterward so the read sees committed data.
    await ServiceRequestService.patchServiceRequest(serviceRequestId, req.body)
    const response = await ServiceRequestService.getServiceRequest(serviceRequestId)
    res.json(response)
  }
  catch (err) {
    next(err)
  }
}

module.exports.deleteServiceRequest = async function deleteServiceRequest (req, res, next) {
  try {
    const serviceRequestId = req.params.serviceRequestId
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
