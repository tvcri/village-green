'use strict';

const PersonService = require('../service/PersonService')
const SmError = require('../utils/error')

module.exports.getPersons = async function getPersons (req, res, next) {
  try {
    const elevate = req.query.elevate
    if (elevate && !req.userObject.privileges?.admin) {
      throw new SmError.PrivilegeError()
    }
    const { villageId, firstName, lastName, phone, email, role } = req.query
    const villageIdsGranted = Object.keys(req.userObject.grants)
    const response = await PersonService.getPersons({
      villageIdsGranted,
      elevate,
      villageId,
      firstName,
      lastName,
      phone,
      email,
      role
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
    const response = await PersonService.createPerson(body)
    res.status(201).json(response[0])
  }
  catch (err) {
    next(err)
  }
}

module.exports.getPerson = async function getPerson (req, res, next) {
  try {
    const personId = req.params.personId
    const projection = req.query.projection ?? []
    const response = await PersonService.getPerson(personId, projection)
    if (!response) {
      throw new SmError.NotFoundError()
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

    const existing = await PersonService.getPerson(personId)
    if (!existing) {
      throw new SmError.NotFoundError()
    }

    await PersonService.patchPerson(personId, body)
    const response = await PersonService.getPerson(personId)
    res.json(response)
  }
  catch (err) {
    next(err)
  }
}

module.exports.deletePerson = async function deletePerson (req, res, next) {
  try {
    const personId = req.params.personId

    const existing = await PersonService.getPerson(personId)
    if (!existing) {
      throw new SmError.NotFoundError()
    }

    await PersonService.deletePerson(personId)
    res.json(existing)
  }
  catch (err) {
    next(err)
  }
}
