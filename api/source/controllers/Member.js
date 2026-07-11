'use strict';
const MemberService = require('../service/MemberService')
const PersonService = require('../service/PersonService')
const SmError = require('../utils/error')
const { hasPermission } = require('../utils/authz')

module.exports.putPersonMember = async function putPersonMember (req, res, next) {
  try {
    const personId = req.params.personId
    const person = await PersonService.getPerson(personId)
    if (!person) throw new SmError.NotFoundError()
    // The member role is granted against the person's home village, not a
    // body field — gate on the person record being mutated, same as Volunteer.
    if (!hasPermission(req.userObject, 'member:write', { villageId: person.village?.villageId })) {
      throw new SmError.PrivilegeError()
    }
    if (!(await MemberService.personHasHomeVillage(personId))) {
      throw new SmError.UnprocessableError('Person must have a home village to hold a member role.')
    }
    const response = await MemberService.putMember(personId, req.body)
    res.json(response)
  }
  catch (err) { next(err) }
}

module.exports.patchPersonMember = async function patchPersonMember (req, res, next) {
  try {
    const personId = req.params.personId
    const person = await PersonService.getPerson(personId)
    if (!person || !(await MemberService.memberExists(personId))) throw new SmError.NotFoundError()
    // Gate on the existing person's village, not the patch body's.
    if (!hasPermission(req.userObject, 'member:write', { villageId: person.village?.villageId })) {
      throw new SmError.PrivilegeError()
    }
    const response = await MemberService.patchMember(personId, req.body)
    res.json(response)
  }
  catch (err) { next(err) }
}

module.exports.deletePersonMember = async function deletePersonMember (req, res, next) {
  try {
    const personId = req.params.personId
    const person = await PersonService.getPerson(personId)
    if (!person || !(await MemberService.memberExists(personId))) throw new SmError.NotFoundError()
    if (!hasPermission(req.userObject, 'member:write', { villageId: person.village?.villageId })) {
      throw new SmError.PrivilegeError()
    }
    await MemberService.deleteMember(personId)
    res.status(204).end()
  }
  catch (err) { next(err) }
}
