'use strict';

const PersonService = require('../service/PersonService')
const DonorService = require('../service/DonorService')
const SmError = require('../utils/error')
const { hasPermission } = require('../utils/authz')

// Donors come from LGL. These endpoints are the import's and integration's
// write path; no UI calls them. Unlike member, a donor needs no home village.

module.exports.putPersonDonor = async function putPersonDonor (req, res, next) {
  try {
    const personId = req.params.personId
    const person = await PersonService.getPerson(personId)
    if (!person) throw new SmError.NotFoundError()
    if (!hasPermission(req.userObject, 'donor:write', { villageId: person.village?.villageId })) {
      throw new SmError.PrivilegeError()
    }
    const response = await DonorService.putDonor(personId, req.body, req.userObject)
    res.json(response)
  }
  catch (err) { next(err) }
}

module.exports.deletePersonDonor = async function deletePersonDonor (req, res, next) {
  try {
    const personId = req.params.personId
    const person = await PersonService.getPerson(personId)
    if (!person || !(await DonorService.donorExists(personId))) throw new SmError.NotFoundError()
    if (!hasPermission(req.userObject, 'donor:write', { villageId: person.village?.villageId })) {
      throw new SmError.PrivilegeError()
    }
    await DonorService.deleteDonor(personId, req.userObject.userId)
    res.status(204).end()
  }
  catch (err) { next(err) }
}
