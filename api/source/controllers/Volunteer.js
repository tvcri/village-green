'use strict';
const VolunteerService = require('../service/VolunteerService')
const PersonService = require('../service/PersonService')
const SmError = require('../utils/error')
const VillageService = require('../service/VillageService')
const { hasPermission } = require('../utils/authz')
const volunteerReadScope = require('../utils/volunteerReadScope')
const volunteerAssignments = require('../service/volunteerAssignments')

// Each added or removed position is authorized against its own scope
// (spec §4.3 step 3): village scope needs volunteer:write in that village;
// Hub and circle scopes need a federation-level grant. Unchanged rows are
// not re-checked.
async function authorizePositionChanges (req, personId, requested) {
  const { added, removed } = await volunteerAssignments.positionChanges(personId, requested)
  for (const p of [...added, ...removed]) {
    const ok = p.scope === 'village'
      ? hasPermission(req.userObject, 'volunteer:write', { villageId: p.villageId })
      : hasPermission(req.userObject, 'volunteer:write')
    if (!ok) throw new SmError.PrivilegeError()
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
