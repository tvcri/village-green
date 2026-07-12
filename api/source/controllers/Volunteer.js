'use strict';
const VolunteerService = require('../service/VolunteerService')
const MemberService = require('../service/MemberService')
const PersonService = require('../service/PersonService')
const SmError = require('../utils/error')
const VillageService = require('../service/VillageService')
const { hasPermission } = require('../utils/authz')

module.exports.getVolunteers = async function getVolunteers (req, res, next) {
  try {
    const allVillages = hasPermission(req.userObject, 'volunteer:read')
    const villageIdsGranted = Object.keys(req.userObject.grants).filter(
      vid => hasPermission(req.userObject, 'volunteer:read', { villageId: vid })
    )
    if (!allVillages && !villageIdsGranted.length) {
      throw new SmError.PrivilegeError()
    }
    const response = await VillageService.getVolunteers({ villageIdsGranted, allVillages })
    res.json(response)
  }
  catch (err) { next(err) }
}

module.exports.putPersonVolunteer = async function putPersonVolunteer (req, res, next) {
  try {
    const personId = req.params.personId
    const person = await PersonService.getPerson(personId)
    if (!person) throw new SmError.NotFoundError()
    // The volunteer role is granted against the person's home village, not a
    // body field — gate on the person record being mutated, same as Member.
    if (!hasPermission(req.userObject, 'volunteer:write', { villageId: person.village?.villageId })) {
      throw new SmError.PrivilegeError()
    }
    if (!(await MemberService.personHasHomeVillage(personId))) {
      throw new SmError.UnprocessableError('Person must have a home village to hold a volunteer role.')
    }
    const response = await VolunteerService.putVolunteer(personId, req.body, req.userObject)
    res.json(response)
  }
  catch (err) { next(err) }
}

module.exports.patchPersonVolunteer = async function patchPersonVolunteer (req, res, next) {
  try {
    const personId = req.params.personId
    const person = await PersonService.getPerson(personId)
    if (!person || !(await VolunteerService.volunteerExists(personId))) throw new SmError.NotFoundError()
    // Gate on the existing person's village, not the patch body's.
    if (!hasPermission(req.userObject, 'volunteer:write', { villageId: person.village?.villageId })) {
      throw new SmError.PrivilegeError()
    }
    const response = await VolunteerService.patchVolunteer(personId, req.body, req.userObject)
    res.json(response)
  }
  catch (err) { next(err) }
}

module.exports.deletePersonVolunteer = async function deletePersonVolunteer (req, res, next) {
  try {
    const personId = req.params.personId
    const person = await PersonService.getPerson(personId)
    if (!person || !(await VolunteerService.volunteerExists(personId))) throw new SmError.NotFoundError()
    if (!hasPermission(req.userObject, 'volunteer:write', { villageId: person.village?.villageId })) {
      throw new SmError.PrivilegeError()
    }
    await VolunteerService.deleteVolunteer(personId)
    res.status(204).end()
  }
  catch (err) { next(err) }
}
