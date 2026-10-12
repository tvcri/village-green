'use strict';
const VolunteerService = require('../service/VolunteerService')
const PersonService = require('../service/PersonService')
const SmError = require('../utils/error')
const VillageService = require('../service/VillageService')
const { hasPermission, canWritePosition } = require('../utils/authz')
const volunteerReadScope = require('../utils/volunteerReadScope')
const volunteerAssignments = require('../service/volunteerAssignments')

// Each added or removed position is authorized against its own scope
// (canWritePosition). Unchanged rows are not re-checked.
async function authorizePositionChanges (req, personId, requested) {
  const { added, removed } = await volunteerAssignments.positionChanges(personId, requested)
  for (const p of [...added, ...removed]) {
    if (!canWritePosition(req.userObject, p.scope, p.villageId)) throw new SmError.PrivilegeError()
  }
}

module.exports.getVolunteers = async function getVolunteers (req, res, next) {
  try {
    const { villageIdsGranted, includeInactive } = volunteerReadScope(req.userObject)
    const response = await VillageService.getVolunteers({
      villageIdsGranted,
      includeInactive: req.query.includeInactive === true && includeInactive,
    })
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
    // Unlike Member, no home village is required: a villageless person is a
    // Hub volunteer, and the gate then needs a federation-level grant.
    if (!hasPermission(req.userObject, 'volunteer:write', { villageId: person.village?.villageId })) {
      throw new SmError.PrivilegeError()
    }
    await authorizePositionChanges(req, personId, req.body.positions ?? [])
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
    if (req.body.positions !== undefined) await authorizePositionChanges(req, personId, req.body.positions)
    // Without positions, an associate change revokes what it no longer covers
    // (D8); those removals need the same per-scope authorization.
    else if (req.body.associateVillageIds !== undefined) {
      await volunteerAssignments.authorizeRevocations(req.userObject, personId, { associateVillageIds: req.body.associateVillageIds })
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
    await VolunteerService.deleteVolunteer(personId, req.userObject.userId)
    res.status(204).end()
  }
  catch (err) { next(err) }
}
