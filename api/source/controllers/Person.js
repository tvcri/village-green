'use strict';

const PersonService = require('../service/PersonService')
const SmError = require('../utils/error')
const { hasPermission } = require('../utils/authz')

module.exports.getPersons = async function getPersons (req, res, next) {
  try {
    const { villageId, firstName, lastName, phone, email, role } = req.query
    if (villageId?.length) {
      if (!villageId.every(vid => hasPermission(req.userObject, 'person:read', { villageId: vid }))) {
        throw new SmError.PrivilegeError()
      }
    }
    else if (!hasPermission(req.userObject, 'person:read')) {
      // No village filter = federation-wide query: requires a federation read.
      throw new SmError.PrivilegeError()
    }
    const villageIdsGranted = hasPermission(req.userObject, 'person:read')
      ? null // federation read: unrestricted
      : Object.keys(req.userObject.grants).filter(
          vid => hasPermission(req.userObject, 'person:read', { villageId: vid })
        )
    const response = await PersonService.getPersons({
      villageIdsGranted, villageId, firstName, lastName, phone, email, role,
    })
    res.json(response)
  }
  catch (err) {
    next(err)
  }
}

module.exports.createPerson = async function createPerson (req, res, next) {
  try {
    const body = req.body
    // Person records are village-scoped when villageId is set (PersonPost
    // allows a nullable villageId); a village-less person is global, so it
    // requires the federation-level grant rather than a per-village one.
    if (!hasPermission(req.userObject, 'person:write', { villageId: body.villageId })) {
      throw new SmError.PrivilegeError()
    }
    const personId = await PersonService.createPerson(body)
    const response = await PersonService.getPerson(personId, [], req.userObject)
    res.status(201).json(response)
  }
  catch (err) {
    next(err)
  }
}

module.exports.getPerson = async function getPerson (req, res, next) {
  try {
    const personId = req.params.personId
    const projection = req.query.projection ?? []
    const response = await PersonService.getPerson(personId, projection, req.userObject)
    if (!response) {
      throw new SmError.NotFoundError()
    }
    if (!hasPermission(req.userObject, 'person:read', { villageId: response.village?.villageId })) {
      throw new SmError.PrivilegeError()
    }
    res.json(response)
  }
  catch (err) {
    next(err)
  }
}

module.exports.patchPerson = async function patchPerson (req, res, next) {
  try {
    const personId = req.params.personId
    const body = req.body

    const existing = await PersonService.getPerson(personId, [], req.userObject)
    if (!existing) {
      throw new SmError.NotFoundError()
    }
    // Gate on the existing record's village, not the patch body's — the
    // resource being mutated is what determines the required grant.
    if (!hasPermission(req.userObject, 'person:write', { villageId: existing.village?.villageId })) {
      throw new SmError.PrivilegeError()
    }

    await PersonService.patchPerson(personId, body)
    const response = await PersonService.getPerson(personId, [], req.userObject)
    res.json(response)
  }
  catch (err) {
    next(err)
  }
}

module.exports.deletePerson = async function deletePerson (req, res, next) {
  try {
    const personId = req.params.personId

    const existing = await PersonService.getPerson(personId, [], req.userObject)
    if (!existing) {
      throw new SmError.NotFoundError()
    }
    if (!hasPermission(req.userObject, 'person:write', { villageId: existing.village?.villageId })) {
      throw new SmError.PrivilegeError()
    }

    await PersonService.deletePerson(personId)
    res.json(existing)
  }
  catch (err) {
    next(err)
  }
}
