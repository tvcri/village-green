'use strict';

const VillageService = require('../service/VillageService')
const SmError = require('../utils/error')
const { hasPermission, hasElevatedPermission } = require('../utils/authz')
const { validateRoleGrants } = require('./User')
const { resolveMetricsRange, todayCivil } = require('../utils/metricsRange')
const config = require('../utils/config')

module.exports.getVillages = async function getVillages (req, res, next) {
  try {
    const projections = req.query.projection
    const allVillages = hasPermission(req.userObject, 'village:read')
    const response = await VillageService.queryVillages({
      projections,
      allVillages,
      grants: req.userObject.grants
    })
    res.json(response)
  }
  catch (err) {
    next(err)
  }
}

module.exports.createVillage = async function createVillage (req, res, next) {
  try {
    if (!hasElevatedPermission(req.userObject, 'village:create', req)) {
      throw new SmError.PrivilegeError()
    }
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
    if (!hasPermission(req.userObject, 'village:read', { villageId })) {
      throw new SmError.PrivilegeError()
    }
    const projections = req.query.projection
    const response = await VillageService.queryVillages({
      filter: {villageId},
      projections,
      allVillages: true
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
    if (!hasPermission(req.userObject, 'village:write', { villageId })) {
      throw new SmError.PrivilegeError()
    }
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
    if (!hasPermission(req.userObject, 'village:write', { villageId })) {
      throw new SmError.PrivilegeError()
    }

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
    if (!hasPermission(req.userObject, 'member:read', { villageId })) {
      throw new SmError.PrivilegeError()
    }

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
    if (!hasPermission(req.userObject, 'volunteer:read', { villageId })) {
      throw new SmError.PrivilegeError()
    }

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
    if (!hasPermission(req.userObject, 'person:read', { villageId })) {
      throw new SmError.PrivilegeError()
    }

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

module.exports.getVillagePerson = async function getVillagePerson (req, res, next) {
  try {
    const villageId = req.params.villageId
    const personId = req.params.personId
    if (!hasPermission(req.userObject, 'person:read', { villageId })) {
      throw new SmError.PrivilegeError()
    }

    const existing = await VillageService.getVillage(villageId)
    if (!existing) {
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
    if (!hasPermission(req.userObject, 'sr:read', { villageId })) {
      throw new SmError.PrivilegeError()
    }
    const status = req.query.status
    const existing = await VillageService.getVillage(villageId)
    if (!existing) {
      throw new SmError.NotFoundError()
    }

    const response = await VillageService.getVillageServiceRequests(villageId, status)
    res.json(response)
  }
  catch (err) {
    next(err)
  }
}

module.exports.getVillageMetrics = async function getVillageMetrics (req, res, next) {
  try {
    const villageId = req.params.villageId
    if (!hasPermission(req.userObject, 'sr:read', { villageId })) {
      throw new SmError.PrivilegeError()
    }
    // Default the range end to today in the deployment's civil timezone, so
    // an Eastern user near midnight doesn't get metrics that run through the
    // server's (UTC) tomorrow.
    const today = todayCivil(config.settings.civilTimeZone)
    const { start, end } = resolveMetricsRange(req.query.start, req.query.end, today)
    const existing = await VillageService.getVillage(villageId)
    if (!existing) {
      throw new SmError.NotFoundError()
    }
    const response = await VillageService.getVillageMetrics(villageId, start, end)
    res.json(response)
  }
  catch (err) {
    next(err)
  }
}

module.exports.getVillageGrants = async function getVillageGrants (req, res, next) {
  try {
    const villageId = req.params.villageId
    if (!hasElevatedPermission(req.userObject, 'grant:admin', req)) {
      throw new SmError.PrivilegeError()
    }

    const existing = await VillageService.getVillage(villageId)
    if (!existing) {
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
    if (!hasElevatedPermission(req.userObject, 'grant:admin', req)) {
      throw new SmError.PrivilegeError()
    }
    const body = req.body

    const existing = await VillageService.getVillage(villageId)
    if (!existing) {
      throw new SmError.NotFoundError()
    }

    // A grant written under /villages/{villageId}/grants always carries this
    // villageId — reuse validateRoleGrants by pairing each grant's roleId
    // with the path's villageId (the grant body itself has no villageId
    // field; it's implied by the URL).
    await validateRoleGrants(body.map(grant => ({ roleId: grant.roleId, villageId })))

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
    if (!hasElevatedPermission(req.userObject, 'grant:admin', req)) {
      throw new SmError.PrivilegeError()
    }
    const body = req.body

    const existing = await VillageService.getVillage(villageId)
    if (!existing) {
      throw new SmError.NotFoundError()
    }

    // See createVillageGrant: villageId comes from the path, not the body.
    await validateRoleGrants(body.map(grant => ({ roleId: grant.roleId, villageId })))

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
    if (!hasElevatedPermission(req.userObject, 'grant:admin', req)) {
      throw new SmError.PrivilegeError()
    }

    const existing = await VillageService.getVillage(villageId)
    if (!existing) {
      throw new SmError.NotFoundError()
    }

    const response = await VillageService.deleteVillageGrant(villageId, grantId)
    res.json(response)
  }
  catch (err) {
    next(err)
  }
}
