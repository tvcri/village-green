'use strict';
const MemberService = require('../service/MemberService')
const PersonService = require('../service/PersonService')
const SmError = require('../utils/error')

module.exports.putPersonMember = async function putPersonMember (req, res, next) {
  try {
    const personId = req.params.personId
    const person = await PersonService.getPerson(personId)
    if (!person) throw new SmError.NotFoundError()
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
    if (!(await MemberService.memberExists(personId))) throw new SmError.NotFoundError()
    const response = await MemberService.patchMember(personId, req.body)
    res.json(response)
  }
  catch (err) { next(err) }
}

module.exports.deletePersonMember = async function deletePersonMember (req, res, next) {
  try {
    const personId = req.params.personId
    if (!(await MemberService.memberExists(personId))) throw new SmError.NotFoundError()
    await MemberService.deleteMember(personId)
    res.status(204).end()
  }
  catch (err) { next(err) }
}
