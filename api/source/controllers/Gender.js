'use strict';
const GenderService = require('../service/GenderService')

module.exports.getGenders = async function getGenders (req, res, next) {
  try {
    const response = await GenderService.getAllGenders()
    res.json(response)
  }
  catch (err) { next(err) }
}
