'use strict';
const EthnicityService = require('../service/EthnicityService')

module.exports.getEthnicities = async function getEthnicities (req, res, next) {
  try {
    const response = await EthnicityService.getAllEthnicities()
    res.json(response)
  }
  catch (err) { next(err) }
}
