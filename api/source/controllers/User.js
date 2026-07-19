'use strict';

const config = require('../utils/config')
const UserService = require(`../service/UserService`)
const VillageService = require(`../service/VillageService`)
const SmError = require('../utils/error')
const dbUtils = require('../service/utils')
const KeycloakService = require('../service/KeycloakService')
const { hasElevatedPermission, holdsAnyElevatable } = require('../utils/authz')

// Also used by controllers/Village.js to validate village-grant writes
// (villageId there comes from the URL path, not the grant body — the caller
// maps each grant to {roleId, villageId} before calling in).
async function validateRoleGrants(roleGrants) {
  if (!roleGrants?.length) return
  const [roles] = await dbUtils.pool.query('SELECT roleId, scope FROM role')
  const scopeById = new Map(roles.map(r => [String(r.roleId), r.scope]))
  const villages = await VillageService.queryVillages({ allVillages: true })
  const villageIds = new Set(villages.map(v => String(v.villageId)))
  for (const g of roleGrants) {
    const scope = scopeById.get(String(g.roleId))
    if (!scope) throw new SmError.UnprocessableError(`Unknown roleId ${g.roleId}`)
    if (scope === 'village' && (g.villageId === null || g.villageId === undefined)) {
      throw new SmError.UnprocessableError('village-scoped role requires villageId')
    }
    if (scope === 'federation' && g.villageId != null) {
      throw new SmError.UnprocessableError('federation-scoped role must not have villageId')
    }
    if (g.villageId != null && !villageIds.has(String(g.villageId))) {
      throw new SmError.UnprocessableError(`Unknown villageId ${g.villageId}`)
    }
  }
}
module.exports.validateRoleGrants = validateRoleGrants

/*  */
module.exports.createUser = async function createUser (req, res, next) {
  try {
    if (!hasElevatedPermission(req.userObject, 'user:admin', req)) {
      throw new SmError.PrivilegeError()
    }
    let body = req.body
    let projection = req.query.projection
    const createInKeycloak = req.query.keycloak !== false

    if (body.roleGrants?.length) {
      await validateRoleGrants(body.roleGrants)
    }

    if (createInKeycloak) {
      try {
        await KeycloakService.createUser({
          username: body.username,
          email: body.username,
          firstName: body.firstName,
          lastName: body.lastName
        })
      }
      catch (err) {
        if (err.status === 409) {
          throw new SmError.UnprocessableError('User already exists in Keycloak.')
        }
        throw err
      }
    }

    const { firstName, lastName, ...userDataBody } = body
    userDataBody.status = 'available'
    try {
      let response = await UserService.createUser(userDataBody, projection, req.userObject, res.svcStatus)
      res.status(201).json(response)
    }
    catch (err) {
      // This is MySQL specific, should abstract
      if (err.code === 'ER_DUP_ENTRY') {
        throw new SmError.UnprocessableError('Duplicate name exists.')
      }
      else {
        throw err
      }
    }
  }
  catch(err) {
    next(err)
  }
}

module.exports.deleteUser = async function deleteUser (req, res, next) {
  try {
    if (!hasElevatedPermission(req.userObject, 'user:admin', req)) {
      throw new SmError.PrivilegeError()
    }
    let userId = req.params.userId
    let projection = req.query.projection
    let userData = await UserService.getUserByUserId(userId, [], req.userObject)
    if (userData) {
      await KeycloakService.deleteUser({ username: userData.username })
    }
    let response
    if (userData?.lastAccess) {
      // User has accessed the system: preserve the user_data row (foreign
      // key references elsewhere depend on it) and soft-delete by setting
      // status to unavailable instead of removing the row.
      response = await UserService.replaceUser(userId, {
        status: 'unavailable',
        statusUser: req.userObject.userId,
        statusDate: new Date(),
        roleGrants: [],
        userGroups: []
      }, projection, req.userObject, res.svcStatus)
    }
    else {
      response = await UserService.deleteUser(userId, projection, req.userObject)
    }
    res.json(response)
  }
  catch(err) {
    next(err)
  }
}

module.exports.exportUsers = async function exportUsers (projection, elevate, userObject) {
  if (elevate) {
    return await UserService.getUsers(null, null, null, projection, userObject )
  }
  else {
    throw new SmError.PrivilegeError()
  }
}

module.exports.exportUserGroups = async function exportUserGroups (projections, elevate) {

  if (elevate) {
    return await UserService.queryUserGroups({projections})
  }
  else {
    throw new SmError.PrivilegeError()    
  }
}

module.exports.getUser = async function getUser (req, res, next) {
  try {
    // privacyStatus is always included (not opt-in): the privacy-ack gate
    // allowlists this endpoint specifically so bootstrap can read it while
    // blocked, and the client has no other way to learn its own ack status.
    const projection = ['grants', 'statistics', 'privacyStatus']
    if (req.query.projection) {
      projection.push(...req.query.projection)
    }

    let response = await UserService.getUserByUserId(req.userObject.userId, projection)
    response.canElevate = holdsAnyElevatable(req.userObject)

    // Volunteer block (VSS): identity-derived from the caller's linked person.
    // A personId only means the username matched exactly one person by email —
    // it does NOT mean that person is a volunteer. The VSS surface (and its
    // /volunteer-requests gate) admit only ACTIVE volunteers, so gate this block
    // on the same isActiveVolunteer check the access gate uses; otherwise the
    // client offers a surface the API 403s. Don't infer volunteer status from
    // villages.length — person.villageId is nullable, so an active volunteer
    // with no village would be wrongly excluded.
    const personId = req.userObject.personId
    if (personId && await UserService.isActiveVolunteer(personId)) {
      const [villages, capabilities] = await Promise.all([
        UserService.getVolunteerVillages(personId),
        UserService.getVolunteerCapabilities(personId),
      ])
      response.volunteer = { personId: String(personId), villages, capabilities }
    } else {
      response.volunteer = null
    }


    res.json(response)
}
  catch(err) {
    next(err)
  }
}

module.exports.getUserByUserId = async function getUserByUserId (req, res, next) {
  try {
    if (!hasElevatedPermission(req.userObject, 'user:admin', req)) {
      throw new SmError.PrivilegeError()
    }
    let userId = req.params.userId
    let projection = req.query.projection
    let response = await UserService.getUserByUserId(userId, projection, req.userObject)
    if(!response) {
      throw new SmError.NotFoundError()
    }
    res.json(response)
  }
  catch(err) {
    next(err)
  }
}

module.exports.getUsers = async function getUsers (req, res, next) {
  try {
    if (!hasElevatedPermission(req.userObject, 'user:admin', req)) {
      throw new SmError.PrivilegeError()
    }
    let username = req.query.username
    let usernameMatch = req.query['username-match']
    let status = req.query.status
    let projection = req.query.projection
    let response = await UserService.getUsers( username, usernameMatch, status, projection, req.userObject)
    res.json(response)
  }
  catch(err) {
    next(err)
  }
}

module.exports.replaceUser = async function replaceUser (req, res, next) {
  try {
    if (!hasElevatedPermission(req.userObject, 'user:admin', req)) {
      throw new SmError.PrivilegeError()
    }
    let userId = req.params.userId
    let body = req.body
    let projection = req.query.projection

    let userData = await UserService.getUserByUserId(userId)
    if (!userData) {
      throw new SmError.NotFoundError("UserId not found.")
    }

    const intendedStatus = body.status || userData.status
    if (intendedStatus === 'unavailable') {
      if (body.roleGrants?.length || body.userGroups?.length) {
        throw new SmError.UserInconsistentError()
      }
    }
    if (body.status) {
      body.statusUser = req.userObject.userId
      body.statusDate = new Date()
    }

    if (body.roleGrants?.length) {
      await validateRoleGrants(body.roleGrants)
    }

    let response = await UserService.replaceUser(userId, body, projection, req.userObject, res.svcStatus)
    res.json(response)
  }
  catch(err) {
    next(err)
  }
}

module.exports.updateUser = async function updateUser (req, res, next) {
  try {
    if (!hasElevatedPermission(req.userObject, 'user:admin', req)) {
      throw new SmError.PrivilegeError()
    }
    let userId = req.params.userId
    let body = req.body
    let projection = req.query.projection

    let userData = await UserService.getUserByUserId(userId)
    if (!userData) {
      throw new SmError.NotFoundError("UserId not found.")
    }

    // Determine intended status: body.status or current status
    const intendedStatus = body.status || userData.status
    if (intendedStatus === 'unavailable') {
      if (body.roleGrants?.length || body.userGroups?.length) {
        throw new SmError.UserInconsistentError()
      }
      body.roleGrants = []
      body.userGroups = []
    }
    if (body.status) {
      body.statusUser = req.userObject.userId
      body.statusDate = new Date()
    }

    if (body.roleGrants?.length) {
      await validateRoleGrants(body.roleGrants)
    }

    let response = await UserService.replaceUser(userId, body, projection, req.userObject, res.svcStatus)
    res.json(response)
  }
  catch(err) {
    next(err)
  }
}

/* c8 ignore start */
module.exports.setUserData = async function setUserData (username, fields) {
  try {
    await UserService.setUserData(username, fields)
    return await UserService.getUserByUsername(username)
  }
  catch (e) {
    next(err)

  }
}
/* c8 ignore end */
module.exports.createUserGroup = async (req, res, next) => {
  try {
    if (!hasElevatedPermission(req.userObject, 'user:admin', req)) {
      throw new SmError.PrivilegeError()
    }
    const {userIds, villageGrants, ...userGroupFields} = req.body
    const invalidUserIds = await dbUtils.selectInvalidUserIds(userIds)
    if (invalidUserIds.length) {
      throw new SmError.UserInconsistentError()
    }

    await validateRoleGrants(villageGrants)

    let userGroupId
    try{
      userGroupId = await UserService.addOrUpdateUserGroup({
        userGroupFields,
        userIds,
        villageGrants,
        createdUserId: req.userObject.userId,
        modifiedUserId: req.userObject.userId
      })
    }
    catch (err) {
      throw err.code === 'ER_DUP_ENTRY' ? new SmError.UnprocessableError('Group name is already in use.') : err
    }
    const response = await UserService.queryUserGroups({
      projections: req.query.projection,
      filters: {userGroupId}
    })
    res.status(201).json(response[0])
  }
  catch (err) {
    next(err)
  }
}

module.exports.getUserGroups = async (req, res, next) => {
  try {
    if (req.query.projection?.includes('villages') && !hasElevatedPermission(req.userObject, 'user:admin', req)) {
      throw new SmError.PrivilegeError('villages projection requires elevation')
    }
    const response = await UserService.queryUserGroups({
      projections: req.query.projection
    })
    res.json(response)
  }
  catch (err) {
    next(err)
  }
}

module.exports.getUserGroup = async (req, res, next) => {
  try {
    if (req.query.projection?.includes('villages') && !hasElevatedPermission(req.userObject, 'user:admin', req)) {
      throw new SmError.PrivilegeError('villages projection requires elevation')
    }
    const response = await UserService.queryUserGroups({
      projections: req.query.projection,
      filters: {userGroupId: req.params.userGroupId}
    })
    if (!response[0]) throw new SmError.NotFoundError()
    res.json(response[0])
  }
  catch (err) {
    next(err)
  }
}

async function putOrPatchUserGroup (req, res, next) {
  try {
    if (!hasElevatedPermission(req.userObject, 'user:admin', req)) {
      throw new SmError.PrivilegeError()
    }
    const {userIds, villageGrants, ...userGroupFields} = req.body
    const invalidUserIds = await dbUtils.selectInvalidUserIds(userIds)
    if (invalidUserIds.length) {
      throw new SmError.UserInconsistentError()
    }

    await validateRoleGrants(villageGrants)

    const userGroup = await UserService.queryUserGroups({
      projections: [],
      filters: {userGroupId: req.params.userGroupId}
    })
    if (!userGroup.length) throw new SmError.NotFoundError("UserGroup not found.")
    const userGroupId = await UserService.addOrUpdateUserGroup({
      userGroupId: req.params.userGroupId,
      userGroupFields,
      userIds,
      villageGrants,
      modifiedUserId: req.userObject.userId
    })
    const response = await UserService.queryUserGroups({
      projections: req.query.projection,
      filters: {userGroupId}
    })
    res.json(response[0])
  }
  catch (err) {
    next(err)
  }
}

module.exports.patchUserGroup = putOrPatchUserGroup
module.exports.putUserGroup = putOrPatchUserGroup

module.exports.deleteUserGroup = async (req, res, next) => {
  try{
    if (!hasElevatedPermission(req.userObject, 'user:admin', req)) {
      throw new SmError.PrivilegeError()
    }
    const response = await UserService.queryUserGroups({
      projections: req.query.projection,
      filters: {userGroupId: req.params.userGroupId}
    })
    await UserService.deleteUserGroup({
      userGroupId: req.params.userGroupId,
    })
    res.json(response[0])
  }
  catch (err) {
    next(err)
  }
}

module.exports.getUserWebPreferences = async (req, res, next) => {
  try {
    const response = await UserService.getUserWebPreferences(req.userObject.userId)
    res.json(response)
  }
  catch (err) {
    next(err)
  }
}

module.exports.patchUserWebPreferences = async (req, res, next) => {
  try {
    const body = req.body
    await UserService.patchUserWebPreferences(req.userObject.userId, body)
    const response = await UserService.getUserWebPreferences(req.userObject.userId)
    res.json(response)
  }
  catch (err) {
    next(err)
  }
}

module.exports.getUserGrants = async function getUserGrants (req, res, next) {
  try {
    const userId = req.params.userId

    if (!hasElevatedPermission(req.userObject, 'grant:admin', req)) {
      throw new SmError.PrivilegeError()
    }

    const user = await UserService.getUserByUserId(userId)
    if (!user) {
      throw new SmError.NotFoundError()
    }

    const response = await UserService.getUserGrants(userId)
    res.json(response)
  }
  catch (err) {
    next(err)
  }
}

module.exports.createUserGrant = async function createUserGrant (req, res, next) {
  try {
    const userId = req.params.userId
    const body = req.body

    if (!hasElevatedPermission(req.userObject, 'grant:admin', req)) {
      throw new SmError.PrivilegeError()
    }

    const user = await UserService.getUserByUserId(userId)
    if (!user) {
      throw new SmError.NotFoundError()
    }

    await validateRoleGrants(body)

    const response = await UserService.createUserGrant(userId, body)
    res.status(201).json(response)
  }
  catch (err) {
    next(err)
  }
}

module.exports.deleteUserGrant = async function deleteUserGrant (req, res, next) {
  try {
    const userId = req.params.userId
    const grantId = req.params.grantId

    if (!hasElevatedPermission(req.userObject, 'grant:admin', req)) {
      throw new SmError.PrivilegeError()
    }

    const user = await UserService.getUserByUserId(userId)
    if (!user) {
      throw new SmError.NotFoundError()
    }

    const response = await UserService.deleteUserGrant(userId, grantId)
    res.json(response)
  }
  catch (err) {
    next(err)
  }
}

