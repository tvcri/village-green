'use strict';

const VillageService = require('../service/VillageService')
const SmError = require('../utils/error')

module.exports.getVillages = async function getVillages (req, res, next) {
  try {
    const projections = req.query.projection
    const elevate = req.query.elevate
    const response = await VillageService.queryVillages({
      projections,
      elevate,
      grants: req.userObject.grants,
      userId: req.userObject.userId
    })
    res.json(response)
  }
  catch (err) {
    next(err)
  }
}

module.exports.createVillage = async function createVillage (req, res, next) {
  try {
    const body = req.body
    try {
      const response = await VillageService.createVillage(body)
      res.status(201).json(response[0])
    }
    catch (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        throw new SmError.UnprocessableError('Duplicate village name.')
      }
      else {
        throw err
      }
    }
  }
  catch (err) {
    next(err)
  }
}

module.exports.getVillage = async function getVillage (req, res, next) {
  try {
    const villageId = req.params.villageId
    const projections = req.query.projection
    const response = await VillageService.queryVillages({
      filter: {villageId},
      projections,
      grants: req.userObject.grants,
      userId: req.userObject.userId
    })
    if (!response[0]) {
      throw new SmError.NotFoundError()
    }
    res.json(response[0])
  }
  catch (err) {
    next(err)
  }
}

module.exports.patchVillage = async function patchVillage (req, res, next) {
  try {
    const villageId = req.params.villageId
    const body = req.body

    const existing = await VillageService.getVillage(villageId)
    if (!existing) {
      throw new SmError.NotFoundError()
    }

    const response = await VillageService.patchVillage(villageId, body)
    res.json(response[0])
  }
  catch (err) {
    next(err)
  }
}

module.exports.deleteVillage = async function deleteVillage (req, res, next) {
  try {
    const villageId = req.params.villageId

    const existing = await VillageService.getVillage(villageId)
    if (!existing) {
      throw new SmError.NotFoundError()
    }

    await VillageService.deleteVillage(villageId)
    res.json(existing)
  }
  catch (err) {
    next(err)
  }
}

module.exports.getVillageMembers = async function getVillageMembers (req, res, next) {
  try {
    const villageId = req.params.villageId

    const existing = await VillageService.queryVillages({
      filter: {villageId},
      grants: req.userObject.grants,
      userId: req.userObject.userId
    })
    if (!existing[0]) {
      throw new SmError.NotFoundError()
    }

    const response = await VillageService.getVillageMembers(villageId)
    res.json(response)
  }
  catch (err) {
    next(err)
  }
}

module.exports.getVillageVolunteers = async function getVillageVolunteers (req, res, next) {
  try {
    const villageId = req.params.villageId

    const existing = await VillageService.queryVillages({
      filter: {villageId},
      grants: req.userObject.grants,
      userId: req.userObject.userId
    })
    if (!existing[0]) {
      throw new SmError.NotFoundError()
    }

    const response = await VillageService.getVillageVolunteers(villageId)
    res.json(response)
  }
  catch (err) {
    next(err)
  }
}

module.exports.getVillagePersons = async function getVillagePersons (req, res, next) {
  try {
    const villageId = req.params.villageId

    const existing = await VillageService.queryVillages({
      filter: {villageId},
      grants: req.userObject.grants,
      userId: req.userObject.userId
    })
    if (!existing[0]) {
      throw new SmError.NotFoundError()
    }

    const response = await VillageService.getVillagePersons(villageId)
    res.json(response)
  }
  catch (err) {
    next(err)
  }
}

module.exports.getVillagePerson = async function getVillagePerson (req, res, next) {
  try {
    const villageId = req.params.villageId
    const personId = req.params.personId

    const existing = await VillageService.queryVillages({
      filter: {villageId},
      grants: req.userObject.grants,
      userId: req.userObject.userId
    })
    if (!existing[0]) {
      throw new SmError.NotFoundError()
    }

    const response = await VillageService.getVillagePerson(villageId, personId)
    if (!response) {
      throw new SmError.NotFoundError()
    }
    res.json(response)
  }
  catch (err) {
    next(err)
  }
}

module.exports.getVillageServiceRequests = async function getVillageServiceRequests (req, res, next) {
  try {
    const villageId = req.params.villageId
    const status = req.query.status
    const existing = await VillageService.queryVillages({
      filter: {villageId},
      grants: req.userObject.grants,
      userId: req.userObject.userId
    })
    if (!existing[0]) {
      throw new SmError.NotFoundError()
    }

    const response = await VillageService.getVillageServiceRequests(villageId, status)
    res.json(response)
  }
  catch (err) {
    next(err)
  }
}

module.exports.getVillageGrants = async function getVillageGrants (req, res, next) {
  try {
    const villageId = req.params.villageId

    const existing = await VillageService.queryVillages({
      filter: {villageId},
      elevate: true,
      userId: req.userObject.userId
    })
    if (!existing[0]) {
      throw new SmError.NotFoundError()
    }

    const response = await VillageService.getVillageGrants(villageId)
    res.json(response)
  }
  catch (err) {
    next(err)
  }
}

module.exports.createVillageGrant = async function createVillageGrant (req, res, next) {
  try {
    const villageId = req.params.villageId
    const body = req.body

    const existing = await VillageService.queryVillages({
      filter: {villageId},
      elevate: true,
      userId: req.userObject.userId
    })
    if (!existing[0]) {
      throw new SmError.NotFoundError()
    }

    const response = await VillageService.createVillageGrant(villageId, body)
    res.status(201).json(response)
  }
  catch (err) {
    next(err)
  }
}

module.exports.replaceVillageGrants = async function replaceVillageGrants (req, res, next) {
  try {
    const villageId = req.params.villageId
    const body = req.body

    const existing = await VillageService.queryVillages({
      filter: {villageId},
      elevate: true,
      userId: req.userObject.userId
    })
    if (!existing[0]) {
      throw new SmError.NotFoundError()
    }

    const response = await VillageService.replaceVillageGrants(villageId, body)
    res.json(response)
  }
  catch (err) {
    next(err)
  }
}

module.exports.deleteVillageGrant = async function deleteVillageGrant (req, res, next) {
  try {
    const villageId = req.params.villageId
    const grantId = req.params.grantId

    const existing = await VillageService.queryVillages({
      filter: {villageId},
      elevate: true,
      userId: req.userObject.userId
    })
    if (!existing[0]) {
      throw new SmError.NotFoundError()
    }

    const response = await VillageService.deleteVillageGrant(villageId, grantId)
    res.json(response)
  }
  catch (err) {
    next(err)
  }
}
