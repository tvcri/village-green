'use strict';
const RaceService = require('../service/RaceService')

module.exports.getRaces = async function getRaces (req, res, next) {
  try {
    const response = await RaceService.getAllRaces()
    res.json(response)
  }
  catch (err) { next(err) }
}
