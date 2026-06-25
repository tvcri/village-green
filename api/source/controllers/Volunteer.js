'use strict';
const VolunteerService = require('../service/VolunteerService')
const MemberService = require('../service/MemberService')
const PersonService = require('../service/PersonService')
const SmError = require('../utils/error')

module.exports.putPersonVolunteer = async function putPersonVolunteer (req, res, next) {
  try {
    const personId = req.params.personId
    const person = await PersonService.getPerson(personId)
    if (!person) throw new SmError.NotFoundError()
    if (!(await MemberService.personHasHomeVillage(personId))) {
      throw new SmError.UnprocessableError('Person must have a home village to hold a volunteer role.')
    }
    const response = await VolunteerService.putVolunteer(personId, req.body)
    res.json(response)
  }
  catch (err) { next(err) }
}

module.exports.patchPersonVolunteer = async function patchPersonVolunteer (req, res, next) {
  try {
    const personId = req.params.personId
    if (!(await VolunteerService.volunteerExists(personId))) throw new SmError.NotFoundError()
    const response = await VolunteerService.patchVolunteer(personId, req.body)
    res.json(response)
  }
  catch (err) { next(err) }
}

module.exports.deletePersonVolunteer = async function deletePersonVolunteer (req, res, next) {
  try {
    const personId = req.params.personId
    if (!(await VolunteerService.volunteerExists(personId))) throw new SmError.NotFoundError()
    await VolunteerService.deleteVolunteer(personId)
    res.status(204).end()
  }
  catch (err) { next(err) }
}
