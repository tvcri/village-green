'use strict';

const PersonService = require('../service/PersonService')
const DonorService = require('../service/DonorService')
const SmError = require('../utils/error')
const { hasPermission } = require('../utils/authz')

// Donors come from LGL. These endpoints are the import's and integration's
// write path; no UI calls them. Unlike member, a donor needs no home village,
// so the keys are checked federation-wide — and FIRST: a 404/403 split
// decided by the donor row would reveal donor status to any caller. Writing
// also needs donor:read: the response is the donor read back, and the
// integration looks persons up by constituent ID (a donor:read filter).
function assertDonorWriter (userObject) {
  if (!hasPermission(userObject, 'donor:write') || !hasPermission(userObject, 'donor:read')) {
    throw new SmError.PrivilegeError()
  }
}

module.exports.putPersonDonor = async function putPersonDonor (req, res, next) {
  try {
    const personId = req.params.personId
    assertDonorWriter(req.userObject)
    if (!(await PersonService.getPerson(personId))) throw new SmError.NotFoundError()
    const response = await DonorService.putDonor(personId, req.body, req.userObject)
    res.json(response)
  }
  catch (err) { next(err) }
}

module.exports.deletePersonDonor = async function deletePersonDonor (req, res, next) {
  try {
    const personId = req.params.personId
    assertDonorWriter(req.userObject)
    if (!(await DonorService.deleteDonor(personId, req.userObject.userId))) throw new SmError.NotFoundError()
    res.status(204).end()
  }
  catch (err) { next(err) }
}
