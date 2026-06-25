'use strict';
const CommunityService = require('../service/CommunityService')
const PersonService = require('../service/PersonService')
const SmError = require('../utils/error')

module.exports.getPersonCommunities = async function getPersonCommunities (req, res, next) {
  try {
    const personId = req.params.personId
    const person = await PersonService.getPerson(personId)
    if (!person) throw new SmError.NotFoundError()
    const response = await CommunityService.getCommunities(personId)
    res.json(response)
  }
  catch (err) { next(err) }
}

module.exports.putPersonCommunities = async function putPersonCommunities (req, res, next) {
  try {
    const personId = req.params.personId
    const person = await PersonService.getPerson(personId)
    if (!person) throw new SmError.NotFoundError()
    const response = await CommunityService.putCommunities(personId, req.body)
    res.json(response)
  }
  catch (err) { next(err) }
}
