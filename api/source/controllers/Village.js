'use strict';

const VillageService = require('../service/VillageService')
const SmError = require('../utils/error')

module.exports.getVillages = async function getVillages (req, res, next) {
  try {
    const response = await VillageService.getVillages()
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
    const response = await VillageService.getVillage(villageId)
    if (!response) {
      throw new SmError.NotFoundError()
    }
    res.json(response)
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

    const existing = await VillageService.getVillage(villageId)
    if (!existing) {
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

    const existing = await VillageService.getVillage(villageId)
    if (!existing) {
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

    const existing = await VillageService.getVillage(villageId)
    if (!existing) {
      throw new SmError.NotFoundError()
    }

    const response = await VillageService.getVillagePersons(villageId)
    res.json(response)
  }
  catch (err) {
    next(err)
  }
}
