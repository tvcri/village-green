'use strict';

const PersonService = require('../service/PersonService')
const DonorService = require('../service/DonorService')
const SmError = require('../utils/error')
const { hasPermission } = require('../utils/authz')

// Donors come from LGL. These endpoints are the import's and integration's
// write path; no UI calls them. Unlike member, a donor needs no home village,
// so donor:write is checked federation-wide — and FIRST: a 404/403 split
// decided by the donor row would reveal donor status to any caller.

module.exports.putPersonDonor = async function putPersonDonor (req, res, next) {
  try {
    const personId = req.params.personId
    if (!hasPermission(req.userObject, 'donor:write')) throw new SmError.PrivilegeError()
    if (!(await PersonService.getPerson(personId))) throw new SmError.NotFoundError()
    const response = await DonorService.putDonor(personId, req.body, req.userObject)
    res.json(response)
  }
  catch (err) { next(err) }
}

module.exports.deletePersonDonor = async function deletePersonDonor (req, res, next) {
  try {
    const personId = req.params.personId
    if (!hasPermission(req.userObject, 'donor:write')) throw new SmError.PrivilegeError()
    if (!(await DonorService.donorExists(personId))) throw new SmError.NotFoundError()
    await DonorService.deleteDonor(personId, req.userObject.userId)
    res.status(204).end()
  }
  catch (err) { next(err) }
}
