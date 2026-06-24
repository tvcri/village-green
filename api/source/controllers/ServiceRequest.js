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
    const response = await ServiceRequestService.createServiceRequest(req.body)
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
    const response = await ServiceRequestService.patchServiceRequest(serviceRequestId, req.body)
    res.json(response)
  }
  catch (err) {
    next(err)
  }
}

module.exports.deleteServiceRequest = async function deleteServiceRequest (req, res, next) {
  try {
    // TODO: Implement deleteServiceRequest
    res.json({})
  }
  catch (err) {
    next(err)
  }
}
