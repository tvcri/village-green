'use strict'

const EnrollmentService = require('../service/EnrollmentService')

// Constant response for /enrollment/request regardless of branch taken -
// the enumeration defense. Must not vary by outcome.
const UNIFORM_MESSAGE = "If your email is registered as a volunteer, we've sent you instructions."

module.exports.requestEnrollment = async function requestEnrollment(req, res, next) {
  try {
    await EnrollmentService.requestEnrollment(req.body.email)
    res.json({ message: UNIFORM_MESSAGE })
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
