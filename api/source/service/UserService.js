'use strict';
const config = require('../utils/config');
const SmError = require('../utils/error');
const dbUtils = require('./utils')
const KeycloakService = require('./KeycloakService')

const _this = this

/**
Generalized queries for users
**/
exports.queryUsers = async function (inProjection, inPredicates, elevate, userObject) {
  const ctes = []
  let needsCollectionGrantees = false
  const columns = [
    'CAST(ud.userId as char) as userId',
    'ud.username',
    'ud.lastAccess',
    `json_extract(
      ud.lastClaims, ?
    ) as email`,
    `COALESCE(json_unquote(json_extract(
      ud.lastClaims, ?
    )), ud.username) as displayName`,
    `json_object(
      'create_village', 'create_village' member of(JSON_VALUE(ud.lastClaims, ? default '[]' on empty)),
      'admin', 'admin' member of(JSON_VALUE(ud.lastClaims, ? default '[]' on empty))
    ) as 'privileges'`,
    'ud.status',
    "date_format(ud.statusDate, '%Y-%m-%dT%TZ') as statusDate",
    'CAST(ud.statusUser as char) as statusUser'
  ]
  const joins = new Set([
    'user_data ud'
  ])
  const groupBy = ['ud.userId']

  const orderBy = ['displayName']

  // PROJECTIONS
  if (inProjection?.includes('villageGrants')) {
    needsCollectionGrantees = true
    joins.add('left join cteGrantees cgs on ud.userId = cgs.userId')
    joins.add('left join village v on cgs.villageId = v.id')
    columns.push(`case when count(cgs.villageId) > 0
    then 
      ${dbUtils.jsonArrayAggDistinct(`json_object(
        'village', json_object(
          'villageId', CAST(cgs.villageId as char),
          'name', v.name
        ),
        'roleId', cgs.roleId,
        'grantees', cgs.grantees
      )`)}
    else json_array() 
    end as villageGrants`)
  }

  if (inProjection?.includes('statistics')) {
    if (!needsCollectionGrantees) {
      needsCollectionGrantees = true
      joins.add('left join cteGrantees cgs on ud.userId = cgs.userId')
    }
    columns.push(`json_object(
        'created', date_format(ud.created, '%Y-%m-%dT%TZ'),
        'lastClaims', ud.lastClaims,
        'villageGrantCount', count(distinct cgs.villageId, cgs.roleId)
      ) as statistics`)
    groupBy.push(
      'ud.lastAccess',
      'ud.lastClaims'
    )
  }
  if (inProjection?.includes('userGroups')) {
    joins.add('left join user_group_user_map ugu on ud.userId = ugu.userId')
    joins.add('left join user_group ug on ugu.userGroupId = ug.userGroupId')
    columns.push(`CASE WHEN COUNT(ugu.userGroupId) > 0
    THEN cast(concat('[', group_concat( distinct JSON_OBJECT(
      'userGroupId', cast(ugu.userGroupId as char),
      'name', ug.name
    )), ']') as json)
    ELSE json_array()
    END as userGroups`)
  }

  if(inProjection?.includes('webPreferences')) {
    columns.push(`ud.webPreferences`)
  }

  if (inProjection?.includes('privacyStatus')) {
    // Correlated subqueries — one round-trip, no JS merge. needsAck is true
    // unless the user's latest ack is of the current rules version AND within
    // the configured interval. ackIntervalDays is a validated positive integer
    // from server config (never user input), safe to inline as a literal.
    const intervalDays = config.privacy.ackIntervalDays
    columns.push(`(
      select json_object(
        'needsAck',
          case
            when (select id from privacy_rules order by id desc limit 1) is null then false
            when exists (
              select 1 from privacy_acknowledgement pa
              where pa.userId = ud.userId
                and pa.rulesId = (select id from privacy_rules order by id desc limit 1)
                and pa.acknowledgedAt > (UTC_TIMESTAMP() - INTERVAL ${intervalDays} DAY)
            ) then false
            else true
          end,
        'pendingRulesId', (select id from privacy_rules order by id desc limit 1),
        'lastAckedRulesId',
          (select pa.rulesId from privacy_acknowledgement pa
           where pa.userId = ud.userId order by pa.id desc limit 1),
        'lastAcknowledgedAt',
          (select date_format(pa.acknowledgedAt, '%Y-%m-%dT%TZ') from privacy_acknowledgement pa
           where pa.userId = ud.userId order by pa.id desc limit 1)
      )
    ) as privacyStatus`)
  }

  // PREDICATES
  let predicates = {
    statements: [],
    binds: [
      `$.${config.oauth.claims.email}`,
      `$.${config.oauth.claims.name}`,
      `$.${config.oauth.claims.privileges}`,
      `$.${config.oauth.claims.privileges}`
    ]
  }
  if (inPredicates.userId) {
    predicates.statements.push('ud.userId = ?')
    predicates.binds.push(inPredicates.userId)
  }
  if ( inPredicates.username ) {
    let matchStr = '= ?'
    if ( inPredicates.usernameMatch && inPredicates.usernameMatch !== 'exact') {
      matchStr = 'LIKE ?'
      switch (inPredicates.usernameMatch) {
        case 'startsWith':
          inPredicates.username = `${inPredicates.username}%`
          break
        case 'endsWith':
          inPredicates.username = `%${inPredicates.username}`
          break
        case 'contains':
          inPredicates.username = `%${inPredicates.username}%`
          break
      }
    }
    predicates.statements.push(`ud.username ${matchStr}`)
    predicates.binds.push(inPredicates.username)
  }
  
  if (inPredicates.privilege) {
    predicates.statements.push(
      `JSON_CONTAINS(JSON_EXTRACT(ud.lastClaims, ?), ?) `
    )
    predicates.binds.push(`$.${config.oauth.claims.privileges}`, JSON.stringify([inPredicates.privilege]))
  }
  
  if (inPredicates.status) {
    predicates.statements.push('ud.status = ?')
    predicates.binds.push(inPredicates.status)
  }
  
  if (needsCollectionGrantees) {
    ctes.push(dbUtils.sqlGrantees({userId: inPredicates.userId, username: inPredicates.username, returnCte: true}))
  }

  // CONSTRUCT MAIN QUERY
  const sql = dbUtils.makeQueryString({ctes, columns, joins, predicates, groupBy, orderBy, format: true})
  let [rows] = await dbUtils.pool.query(sql)
  return (rows)
}

exports.addOrUpdateUser = async function (writeAction, userId, body, projection, elevate, userObject, svcStatus = {}) {
  let connection
  try {
    // CREATE: userId will be null
    // REPLACE/UPDATE: userId is not null

    // Extract or initialize non-scalar properties to separate variables
    let { villageGrants, userGroups, ...userFields } = body

    // If username is being changed on an existing user, Keycloak must be
    // updated first (before the local UPDATE commits), so the two systems
    // never drift out of sync with each other.
    if (writeAction !== dbUtils.WRITE_ACTION.CREATE && userFields.username) {
      const [existingRows] = await dbUtils.pool.query('SELECT username FROM user_data WHERE userId = ?', [userId])
      const currentUsername = existingRows[0]?.username
      if (currentUsername && currentUsername !== userFields.username) {
        try {
          await KeycloakService.updateUsername({ oldUsername: currentUsername, newUsername: userFields.username })
        }
        catch (err) {
          if (err.status === 409) {
            throw new SmError.UnprocessableError('Username already exists in Keycloak.')
          }
          throw err
        }
      }
    }

    connection = await dbUtils.pool.getConnection()
    async function transaction () {
      await connection.query('START TRANSACTION');

      // Process scalar properties
      if (writeAction === dbUtils.WRITE_ACTION.CREATE) {
        // INSERT into user_data
        let sqlInsert =
          `INSERT INTO
              user_data
              ( username, status )
            VALUES
              ( ?, ? )`
        let [result] = await connection.query(sqlInsert, [userFields.username, userFields.status])
        userId = result.insertId
      }
      else if (writeAction === dbUtils.WRITE_ACTION.UPDATE || writeAction === dbUtils.WRITE_ACTION.REPLACE) {
        if (Object.keys(userFields).length > 0) {
          let sqlUpdate =
            `UPDATE
                user_data
              SET
                ?
              WHERE
                userid = ?`
          await connection.query(sqlUpdate, [userFields, userId])
        }
      }
      else {
        throw new Error('Invalid writeAction')
      }
  
      // Process grants if present
      if (villageGrants) {
        if ( writeAction !== dbUtils.WRITE_ACTION.CREATE ) {
          // DELETE from village_grant
          const deleteBinds = [userId]
          let sqlDeleteCollGrant = 'DELETE FROM village_grant where userId = ?'
          if (villageGrants.length > 0) {
            const villageIds = villageGrants.map(grant => grant.villageId)
            sqlDeleteCollGrant += ' and villageId NOT IN (?)'
            deleteBinds.push(villageIds)
          }
          await connection.query(sqlDeleteCollGrant, deleteBinds)
        }
        if (villageGrants.length > 0) {
          let sqlInsertCollGrant = `
            INSERT INTO
              village_grant (userId, villageId, roleId)
            VALUES
              ? as new
            ON DUPLICATE KEY UPDATE
              roleId = new.roleId`
          const insertBinds = villageGrants.map( grant => [userId, grant.villageId, grant.roleId])
          // INSERT into village_grant
          await connection.query(sqlInsertCollGrant, [insertBinds] )
        }
      }
      if (userGroups) {
        if ( writeAction !== dbUtils.WRITE_ACTION.CREATE ) {
          await connection.query('DELETE FROM user_group_user_map where userId = ?', [userId])
        }
        if (userGroups.length > 0) {
          await connection.query(
            `INSERT INTO user_group_user_map (userGroupId, userId) VALUES ?`, 
            [userGroups.map( userGroup => [userGroup, userId])]
          )
        }
      }
      // Commit the changes
      await connection.commit()
    }
    await dbUtils.retryOnDeadlock(transaction, svcStatus)
  }
  catch (err) {
    if (typeof connection !== 'undefined') {
      await connection.rollback()
    }
    throw err
  }
  finally {
    if (typeof connection !== 'undefined') {
      await connection.release()
    }
  }

  // Fetch the new or updated User for the response
  try {
    let row = await _this.getUserByUserId(userId, projection, elevate, userObject)
    return row
  }
  catch (err) {
    throw ( {status: 500, message: err.message, stack: err.stack} )
  }  
}


/**
 * Create a User
 *
 * body UserAssign 
 * projection List Additional properties to include in the response.  (optional)
 * returns List
 **/
exports.createUser = async function(body, projection, elevate, userObject, svcStatus = {}) {
  let row = await _this.addOrUpdateUser(dbUtils.WRITE_ACTION.CREATE, null, body, projection, elevate, userObject, svcStatus)
  return (row)
}


/**
 * Delete a User
 *
 * projection List Additional properties to include in the response.  (optional)
 * returns UserProjected
 **/
exports.deleteUser = async function(userId, projection, elevate, userObject) {
  try {
    let row = await _this.queryUsers(projection, { userId: userId }, elevate, userObject)
    let sqlDelete = `DELETE FROM user_data where userId = ?`
    await dbUtils.pool.query(sqlDelete, [userId])
    return (row[0])
  }
  catch (err) {
    throw ( {status: 500, message: err.message, stack: err.stack} )
  }
}


/**
 * Return a User
 *
 * userId Integer Selects a User
 * projection List Additional properties to include in the response.  (optional)
 * returns UserProjected
 **/
exports.getUserByUserId = async function(userId, projection, elevate, userObject) {
  try {
    let rows = await _this.queryUsers( projection, {
      userId: userId
    }, elevate, userObject)
    return (rows[0])
  }
  catch(err) {
    throw ( {status: 500, message: err.message, stack: err.stack} )
  }
}

exports.getUserByUsername = async function(username, projection, elevate, userObject) {
  try {
    let rows = await _this.queryUsers( projection, {
      username: username
    }, elevate, userObject)
    return (rows[0])
  }
  catch(err) {
    throw ( {status: 500, message: err.message, stack: err.stack} )
  }
}

exports.getUsers = async function(username, usernameMatch, privilege, status, projection, elevate, userObject) {
  try {
    let rows = await _this.queryUsers( projection, {
      username,
      usernameMatch,
      privilege,
      status
    }, elevate, userObject)
    return (rows)
  }
  catch(err) {
    throw ( {status: 500, message: err.message, stack: err.stack} )
  }
}

exports.replaceUser = async function( userId, body, projection, elevate, userObject, svcStatus = {} ) {
  const row = await _this.addOrUpdateUser(dbUtils.WRITE_ACTION.REPLACE, userId, body, projection, elevate, userObject, svcStatus)
  return (row)
}

exports.updateUser = async function( userId, body, projection, elevate, userObject, svcStatus = {} ) {
  if (body.status === 'unavailable' && (body.villageGrants?.length || body.userGroups?.length)) {
    throw new SmError.UserInconsistentError()
  } 
  let row = await _this.addOrUpdateUser(dbUtils.WRITE_ACTION.UPDATE, userId, body, projection, elevate, userObject, svcStatus)
  return (row)
}

exports.setUserData = async function (userObject, fields) {
  if (userObject.userId) {
    await dbUtils.pool.query(`UPDATE user_data SET ? WHERE userId = ?`, [fields, userObject.userId])
    return userObject.userId
  }
  else {
    const [result] = await dbUtils.pool.query(`INSERT INTO user_data SET ?`, [{username: userObject.username, ...fields}])
    return result.insertId
  }
}

exports.addOrUpdateUserGroup = async function ({userGroupId, userGroupFields, userIds, villageGrants, createdUserId, modifiedUserId, svcStatus = {}}) {
  // CREATE: userGroupId is falsey
  // REPLACE/UPDATE: userGroupId is not falsey
  const isUpdate = !!userGroupId

  const sqlInsertUserGroup = `INSERT into user_group (name, description, createdUserId, modifiedUserId) VALUES (?,?,?,?)`
  const sqlUpdateUserGroup = `UPDATE user_group SET ? WHERE userGroupId = ?`
  const sqlInsertUserGroupUserMap = `INSERT into user_group_user_map (userGroupId, userId) VALUES ?`
  const sqlDeleteUserGroupUserMap = `DELETE from user_group_user_map WHERE userGroupId = ?`

  async function transactionFn (connection) {
    if (Object.keys(userGroupFields).length) {
      const sql = isUpdate ? sqlUpdateUserGroup : sqlInsertUserGroup
      const binds = isUpdate ? [userGroupFields, userGroupId] : [userGroupFields.name, userGroupFields.description, createdUserId, modifiedUserId]
      const [resultUserGroup] = await connection.query(sql, binds)
      userGroupId = isUpdate ? userGroupId : resultUserGroup.insertId
    }
    if (userIds) {
      if (isUpdate) {
        await connection.query(sqlDeleteUserGroupUserMap, [userGroupId])
      }
      if (userIds.length) {
        const binds = userIds.map( userId => [userGroupId, userId])
        await connection.query(
          sqlInsertUserGroupUserMap,
          [binds]
        ) 
      }
    }
    // Process grants if present
    if (villageGrants) {
      if (isUpdate) {
        // DELETE from village_grant
        const binds = [userGroupId]
        let sqlDeleteCollGrant = 'DELETE FROM village_grant where userGroupId = ?'
        if (villageGrants.length > 0) {
          const villageIds = villageGrants.map(grant => grant.villageId)
          sqlDeleteCollGrant += ' and villageId NOT IN (?)'
          binds.push(villageIds)
        }
        await connection.query(sqlDeleteCollGrant, binds)
      }
      if (villageGrants.length > 0) {
        let sqlInsertCollGrant = `
          INSERT INTO 
            village_grant (userGroupId, villageId, roleId)
          VALUES
            ? as new
          ON DUPLICATE KEY UPDATE
            roleId = new.roleId`      
        const binds = villageGrants.map( grant => [userGroupId, grant.villageId, grant.roleId])
        // INSERT into village_grant
        await connection.query(sqlInsertCollGrant, [binds] )
      }
    }
    return userGroupId
  }

  return dbUtils.retryOnDeadlock2({
    transactionFn, 
    statusObj: svcStatus
  })
}

exports.queryUserGroups = async function ({projections = [], filters = {}, elevate = false, userObject = {}}) {
  // query components
  const columns = [
    'CAST(ug.userGroupId as char) as userGroupId',
    'ug.name',
    'ug.description'
  ]
  const joins = new Set([`user_group ug`])
  const groupBy = new Set()
  const orderBy = ['name']
  const predicates = {
    statements: [],
    binds: []
  }

  // predicates
  if (filters.userGroupId) {
    predicates.statements.push('ug.userGroupId = ?')
    predicates.binds.push(filters.userGroupId)
  }

  // projections
  if (projections.includes('attributions')) {
    joins.add('left join user_data udCreated on ug.createdUserId = udCreated.userId')
    joins.add('left join user_data udModified on ug.modifiedUserId = udModified.userId')
    columns.push(`json_object(
      'created', json_object(
        'userId', CAST(ug.createdUserId AS CHAR),
        'username', udCreated.username,
        'ts', DATE_FORMAT(ug.createdDate, '%Y-%m-%dT%H:%i:%sZ') 
        ),
      'modified', json_object(
        'userId', CAST(ug.modifiedUserId AS CHAR),
        'username', udModified.username,
        'ts', DATE_FORMAT(ug.modifiedDate, '%Y-%m-%dT%H:%i:%sZ')
        )
    ) as attributions`)
  }
  if (projections.includes('users')) {
    joins.add('left join user_group_user_map ugu using (userGroupId)')
    joins.add('left join user_data udUser on ugu.userId = udUser.userId')
    groupBy.add('ug.userGroupId')
    columns.push(`CASE WHEN count(ugu.userId)=0 
    THEN json_array()
    ELSE cast(concat('[', group_concat(distinct json_object(
      'userId', cast(ugu.userId as char),
      'username', udUser.username,
      'displayName', COALESCE(json_unquote(json_extract(
        udUser.lastClaims, '$.${config.oauth.claims.name}'
      )), udUser.username)
      )
    ), ']') as json)
    END as users`)
  }
  if (projections.includes('villages') || projections.includes('villageGrants')) {
    joins.add('left join village_grant cgg using (userGroupId)')
    joins.add('left join village on cgg.villageId = village.id')
    groupBy.add('ug.userGroupId')
    columns.push(`CASE WHEN count(cgg.villageId)=0 
    THEN json_array()
    ELSE cast(concat('[', group_concat(distinct json_object(
      'roleId', cgg.roleId,
      'village', json_object(
        'villageId', cast(cgg.villageId as char),
        'name', village.name
      ))
    ), ']') as json)
    END as villageGrants`)
  }
  const sql = dbUtils.makeQueryString({columns, joins, predicates, groupBy, orderBy, format: true})
  const [rows] = await dbUtils.pool.query(sql)
  return rows
}

exports.deleteUserGroup = async function({userGroupId}) {
    const sqlDeleteUserGroup = `DELETE from user_group WHERE userGroupId = ?`
    await dbUtils.pool.query(sqlDeleteUserGroup, [userGroupId])
    return userGroupId
}

exports.getUserRoleData = async function (userId) {
  const sql = `
  select
    rg.grantId,
    rg.roleId,
    r.name as roleName,
    r.scope,
    rg.villageId,
    v.name as villageName,
    rp.permission
  from
    role_grant rg
    inner join role r on rg.roleId = r.roleId
    left join role_permission rp on r.roleId = rp.roleId
    left join village v on rg.villageId = v.id
  where
    rg.userId = ?
    or rg.userGroupId in (select userGroupId from user_group_user_map where userId = ?)`
  const [rows] = await dbUtils.pool.query(sql, [userId, userId])
  return rows
}

exports.getUserObject = async function (username) {
  const sql = `
  select
    userId,
    username,
    lastAccess,
    lastClaims,
    status,
    -- Privacy acknowledgement gate (auth-layer boolean only). True when rules are
    -- published and the user has no acknowledgement of the current version within
    -- the configured interval. Ordered by id (monotonic) — not acknowledgedAt.
    (
      case
        when (select id from privacy_rules order by id desc limit 1) is null then 0
        when exists (
          select 1
          from privacy_acknowledgement pa
          where pa.userId = ud.userId
            and pa.rulesId = (select id from privacy_rules order by id desc limit 1)
            and pa.acknowledgedAt > (UTC_TIMESTAMP() - INTERVAL ? DAY)
        ) then 0
        else 1
      end
    ) as privacyAckRequired
  from
    user_data ud
  where
    ud.username = ?`
  const [rows] = await dbUtils.pool.query(sql, [config.privacy.ackIntervalDays, username])
  const row = rows[0]
  if (row) {
    row.privacyAckRequired = row.privacyAckRequired === 1
    const { computeEffective } = require('../utils/authz')
    const roleData = await _this.getUserRoleData(row.userId)
    Object.assign(row, computeEffective(roleData))  // grants, federationGrants, permissions
  }
  return row
}

exports.getUserWebPreferences = async function (userId) {
  const sql = `SELECT webPreferences FROM user_data WHERE userId = ?`
  const [rows] = await dbUtils.pool.query(sql, [userId])
  return rows[0]?.webPreferences
}

exports.patchUserWebPreferences = async function (userId, preferences) {
  const sql = `UPDATE user_data SET webPreferences = JSON_MERGE_PATCH(webPreferences, ?) WHERE userId = ?`
  await dbUtils.pool.query(sql, [JSON.stringify(preferences), userId])
  return preferences
}

exports.getUserGrants = async function (userId) {
  const config = require('../utils/config')
  const sql = `
    SELECT
      CAST(vg.grantId AS CHAR) AS grantId,
      vg.roleId,
      CAST(vg.villageId AS CHAR) AS villageId,
      v.name AS village_name,
      CAST(vg.userId AS CHAR) AS userId,
      CAST(vg.userGroupId AS CHAR) AS userGroupId,
      CASE
        WHEN vg.userId IS NOT NULL THEN 'user'
        WHEN vg.userGroupId IS NOT NULL THEN 'userGroup'
      END AS granteeType,
      CAST(ud.userId AS CHAR) AS grantee_userId,
      ud.username AS grantee_username,
      COALESCE(
        JSON_UNQUOTE(JSON_EXTRACT(ud.lastClaims, "$.${config.oauth.claims.name}")),
        ud.username
      ) AS grantee_displayName,
      CAST(ug.userGroupId AS CHAR) AS grantee_userGroupId,
      ug.name AS grantee_name
    FROM village_grant vg
    JOIN village v ON vg.villageId = v.id
    LEFT JOIN user_data ud ON vg.userId = ud.userId
    LEFT JOIN user_group ug ON vg.userGroupId = ug.userGroupId
    WHERE vg.userId = ? OR vg.userGroupId IN (SELECT userGroupId FROM user_group_user_map WHERE userId = ?)
    ORDER BY vg.grantId
  `
  const [rows] = await dbUtils.pool.query(sql, [userId, userId])

  return rows.map(row => {
    const grantee = row.granteeType === 'user' ? {
      userId: row.grantee_userId,
      username: row.grantee_username,
      displayName: row.grantee_displayName
    } : {
      userGroupId: row.grantee_userGroupId,
      name: row.grantee_name
    }

    return {
      grantId: row.grantId,
      roleId: row.roleId,
      village: {
        villageId: row.villageId,
        name: row.village_name
      },
      grantees: [grantee]
    }
  })
}

exports.createUserGrant = async function (userId, body) {
  const grantsArray = Array.isArray(body) ? body : [body]

  await dbUtils.retryOnDeadlock2({
    transactionFn: async (connection) => {
      for (const grant of grantsArray) {
        const mappedFields = {
          userId,
          villageId: grant.villageId,
          roleId: grant.roleId
        }

        await connection.query('INSERT INTO village_grant SET ?', mappedFields)
      }
    },
    statusObj: undefined
  })

  const grants = await exports.getUserGrants(userId)
  return grants
}

exports.deleteUserGrant = async function (userId, grantId) {
  const [existing] = await dbUtils.pool.query(
    'SELECT * FROM village_grant WHERE grantId = ? AND userId = ?',
    [grantId, userId]
  )

  if (!existing || existing.length === 0) {
    throw new SmError.NotFoundError()
  }

  await dbUtils.pool.query('DELETE FROM village_grant WHERE grantId = ? AND userId = ?', [grantId, userId])

  const grants = await exports.getUserGrants(userId)
  return grants[0] || { grantId }
}
