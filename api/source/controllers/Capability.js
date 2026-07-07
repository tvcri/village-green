'use strict';
const CapabilityService = require('../service/CapabilityService')

module.exports.getCapabilities = async function getCapabilities (req, res, next) {
  try {
    const response = await CapabilityService.getAllCapabilities()
    res.json(response)
  }
  catch (err) { next(err) }
}
