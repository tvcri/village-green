'use strict';
const CircleService = require('../service/CircleService')

module.exports.getCircles = async function getCircles (req, res, next) {
  try {
    const response = await CircleService.getAllCircles()
    res.json(response)
  }
  catch (err) { next(err) }
}
