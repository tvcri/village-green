'use strict';

const SmError = require('../utils/error')
const VillageService = require('../service/VillageService')

module.exports.getVolunteers = async function getVolunteers (req, res, next) {
  try {
    const elevate = req.query.elevate
    if (elevate && !req.userObject.privileges?.admin) {
      throw new SmError.PrivilegeError()
    }
    const villageIdsGranted = Object.keys(req.userObject.grants)
    const response = await VillageService.getVolunteers({ villageIdsGranted, elevate })
    res.json(response)
  }
  catch (err) {
    next(err)
  }
}

module.exports.createVolunteer = async function createVolunteer (req, res, next) {
  try {
    // TODO: Implement createVolunteer
    res.json({})
  }
  catch (err) {
    next(err)
  }
}

module.exports.getVolunteer = async function getVolunteer (req, res, next) {
  try {
    // TODO: Implement getVolunteer
    res.json({})
  }
  catch (err) {
    next(err)
  }
}

module.exports.patchVolunteer = async function patchVolunteer (req, res, next) {
  try {
    // TODO: Implement patchVolunteer
    res.json({})
  }
  catch (err) {
    next(err)
  }
}

module.exports.deleteVolunteer = async function deleteVolunteer (req, res, next) {
  try {
    // TODO: Implement deleteVolunteer
    res.json({})
  }
  catch (err) {
    next(err)
  }
}

module.exports.putVolunteerCapabilities = async function putVolunteerCapabilities (req, res, next) {
  try {
    // TODO: Implement putVolunteerCapabilities
    res.json({})
  }
  catch (err) {
    next(err)
  }
}
