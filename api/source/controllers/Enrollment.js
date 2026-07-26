'use strict'

const EnrollmentService = require('../service/EnrollmentService')

module.exports.requestEnrollment = async function requestEnrollment(req, res, next) {
  try {
    await EnrollmentService.requestEnrollment(req.body.email)
    // Uniform empty 200 regardless of branch taken - the enumeration defense.
    // The acknowledgement text the user sees is display-only copy owned by the
    // client, not the API.
    res.json({})
  }
  catch (err) {
    next(err)
  }
}

module.exports.verifyEnrollment = async function verifyEnrollment(req, res, next) {
  try {
    const result = await EnrollmentService.verifyEnrollment(req.body.email, req.body.pin)
    if (!result) {
      res.status(400).json({ status: 'invalid' })
      return
    }
    res.json(result)
  }
  catch (err) {
    next(err)
  }
}

module.exports.resetEnrollmentPassword = async function resetEnrollmentPassword(req, res, next) {
  try {
    const result = await EnrollmentService.resetEnrollmentPassword(req.body.email, req.body.pin)
    if (!result) {
      res.status(400).json({ status: 'invalid' })
      return
    }
    res.json(result)
  }
  catch (err) {
    next(err)
  }
}
