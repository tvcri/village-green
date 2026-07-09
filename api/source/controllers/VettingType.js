'use strict';
const VettingTypeService = require('../service/VettingTypeService')

module.exports.getVettingTypes = async function getVettingTypes (req, res, next) {
  try {
    const response = await VettingTypeService.getAllVettingTypes()
    res.json(response)
  }
  catch (err) { next(err) }
}
