'use strict';

const config = require('../utils/config')
const UserService = require(`../service/UserService`)
const VillageService = require(`../service/VillageService`)
const SmError = require('../utils/error')
const dbUtils = require('../service/utils')
const KeycloakService = require('../service/KeycloakService')

async function validateVillageGrants(villageGrants, {elevate}) {
  if (villageGrants?.length) {
    // Verify each grant for a valid villageId
    let requestedIds = villageGrants.map( g => g.villageId )
    let availableVillages = await VillageService.queryVillages({elevate})
    let availableIds = availableVillages.map( c => c.villageId)
    if (! requestedIds.every( id => availableIds.includes(id) ) ) {
      throw new SmError.UnprocessableError('One or more villageIds are invalid.')
    }
  }
}

/*  */
module.exports.createUser = async function createUser (req, res, next) {
  try {
    const elevate = req.query.elevate
    if (!elevate) throw new SmError.PrivilegeError()
    let body = req.body
    let projection = req.query.projection
    const createInKeycloak = req.query.keycloak !== false

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
      let response = await UserService.createUser(userDataBody, projection, elevate, req.userObject, res.svcStatus)
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
    let elevate = req.query.elevate
    if (elevate) {
      let userId = req.params.userId
      let projection = req.query.projection
      let userData = await UserService.getUserByUserId(userId, [], elevate, req.userObject)
      if (userData?.lastAccess) {
        // User has accessed the system, so we need to reject the request
        throw new SmError.UnprocessableError('User has accessed the system. Use PATCH to remove village grants or configure Authentication provider to reject user entirely.')
      }
      let response = await UserService.deleteUser(userId, projection, elevate, req.userObject)
      res.json(response)
    }
    else {
      throw new SmError.PrivilegeError()    
    }
  }
  catch(err) {
    next(err)
  }
}

module.exports.exportUsers = async function exportUsers (projection, elevate, userObject) {
  if (elevate) {
    return await UserService.getUsers(null, null, projection, elevate, userObject )
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
    const projection = ['villageGrants', 'statistics', 'privacyStatus']
    if (req.query.projection) {
      projection.push(...req.query.projection)
    }

    let response = await UserService.getUserByUserId(req.userObject.userId, projection)
    response.privileges = req.userObject.privileges
    res.json(response)
}
  catch(err) {
    next(err)
  }
}

module.exports.getUserByUserId = async function getUserByUserId (req, res, next) {
  try {
    let elevate = req.query.elevate
    if ( elevate ) {
      let userId = req.params.userId
      let projection = req.query.projection
      let response = await UserService.getUserByUserId(userId, projection, elevate, req.userObject)
      if(!response) {
        throw new SmError.NotFoundError()
      }
      res.json(response)
    }
    else {
      throw new SmError.PrivilegeError()    
    }
  }
  catch(err) {
    next(err)
  }
}

module.exports.getUsers = async function getUsers (req, res, next) {
  try {
    let elevate = req.query.elevate
    let username = req.query.username
    let usernameMatch = req.query['username-match']
    let privilege = req.query['privilege']
    let status = req.query.status
    let projection = req.query.projection
    if ( !elevate && projection?.length > 0) {
      throw new SmError.PrivilegeError()
    }
    let response = await UserService.getUsers( username, usernameMatch, privilege, status, projection, elevate, req.userObject)
    res.json(response)
  }
  catch(err) {
    next(err)
  }
}

module.exports.replaceUser = async function replaceUser (req, res, next) {
  try {
    let elevate = req.query.elevate
    let userId = req.params.userId
    if (!elevate) throw new SmError.PrivilegeError() 
    let body = req.body
    let projection = req.query.projection

    let userData = await UserService.getUserByUserId(userId)
    if (!userData) {
      throw new SmError.NotFoundError("UserId not found.")
    }

    const intendedStatus = body.status || userData.status
    if (intendedStatus === 'unavailable') {
      if (body.villageGrants?.length || body.userGroups?.length) {
        throw new SmError.UserInconsistentError()
      }
    }
    if (body.status) {
      body.statusUser = req.userObject.userId
      body.statusDate = new Date()
    } 

    if (body.villageGrants?.length) {
      await validateVillageGrants(body.villageGrants, {elevate})
    }

    let response = await UserService.replaceUser(userId, body, projection, elevate, req.userObject, res.svcStatus)
    res.json(response)
  }
  catch(err) {
    next(err)
  }
}

module.exports.updateUser = async function updateUser (req, res, next) {
  try {
    let elevate = req.query.elevate
    if (!elevate) throw new SmError.PrivilegeError()
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
      if (body.villageGrants?.length || body.userGroups?.length) {
        throw new SmError.UserInconsistentError()
      }
      body.villageGrants = []
      body.userGroups = []
    }
    if (body.status) {
      body.statusUser = req.userObject.userId
      body.statusDate = new Date()
    } 

    if (body.villageGrants?.length) {
      await validateVillageGrants(body.villageGrants, {elevate})
    }

    let response = await UserService.replaceUser(userId, body, projection, elevate, req.userObject, res.svcStatus)
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
    if (!req.query.elevate) throw new SmError.PrivilegeError()
    const {userIds, villageGrants, ...userGroupFields} = req.body
    const invalidUserIds = await dbUtils.selectInvalidUserIds(userIds)
    if (invalidUserIds.length) {
      throw new SmError.UserInconsistentError()
    }

    await validateVillageGrants(villageGrants, {elevate: req.query.elevate})

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
    if (req.query.projection?.includes('villages') && !req.query.elevate) {
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
    if (req.query.projection?.includes('villages') && !req.query.elevate) {
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
    if (!req.query.elevate) throw new SmError.PrivilegeError()
    const {userIds, villageGrants, ...userGroupFields} = req.body
    const invalidUserIds = await dbUtils.selectInvalidUserIds(userIds)
    if (invalidUserIds.length) {
      throw new SmError.UserInconsistentError()
    }

    await validateVillageGrants(villageGrants, {elevate: req.query.elevate})

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
    if (!req.query.elevate) throw new SmError.PrivilegeError()
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
    const elevate = req.query.elevate

    if (!elevate) {
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
    const elevate = req.query.elevate

    if (!elevate) {
      throw new SmError.PrivilegeError()
    }

    const user = await UserService.getUserByUserId(userId)
    if (!user) {
      throw new SmError.NotFoundError()
    }

    await validateVillageGrants(body, {elevate})

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
    const elevate = req.query.elevate

    if (!elevate) {
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

