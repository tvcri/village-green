'use strict';
const CommunityService = require('../service/CommunityService')

module.exports.getCommunities = async function getCommunities (req, res, next) {
  try {
    const response = await CommunityService.getAllCommunities()
    res.json(response)
  }
  catch (err) { next(err) }
}
