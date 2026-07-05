'use strict';
const DisabilityService = require('../service/DisabilityService')

module.exports.getDisabilities = async function getDisabilities (req, res, next) {
  try {
    const response = await DisabilityService.getAllDisabilities()
    res.json(response)
  }
  catch (err) { next(err) }
}
