'use strict';
const dbUtils = require('./utils')
const PersonService = require('./PersonService')
const config = require('../utils/config')

const _this = this

module.exports.queryVillages = async function  ({projections = [], filter = {}, allVillages = false, grants = {}, userId = ''}) {
    const villageIdsGranted = Object.keys(grants)
    if (!villageIdsGranted.length && !allVillages) {
      return []
    }

    const ctes = []
    const columns = [
      'CAST(v.id as char) as villageId',
      'v.name'
    ]
    const joins = ['village v']
    const predicates = {
      statements: [],
      binds: []
    }
    const orderBy = ['v.name']

    let requireCteGrantees = false
    let requesterGrantIds = []

    if (!allVillages) {
      for (const villageId in grants) {
        requesterGrantIds.push(grants[villageId].grantIds)
      }
      requesterGrantIds = requesterGrantIds.flat()
    }

    if (projections.includes('owners')) {
      columns.push(`(select coalesce(json_arrayagg(grantJson),json_array()) from
        (select json_object(
          'userId', CAST(user_data.userId as char),
          'username', user_data.username,
          'displayName', JSON_UNQUOTE(JSON_EXTRACT(user_data.lastClaims, "$.${config.oauth.claims.name}"))
          ) as grantJson
        from
          role_grant inner join user_data using (userId) where villageId = v.id and roleId = 4
        UNION
        select json_object(
          'userGroupId', CAST(user_group.userGroupId as char),
          'name', user_group.name,
          'description', user_group.description
        ) as grantJson
        from role_grant inner join user_group using (userGroupId) where villageId = v.id and roleId = 4) o) as owners`)
    }
    if (projections.includes('statistics')) {
      if (!allVillages) {
        requireCteGrantees = true
        columns.push(`(select
          json_object(
          'created', DATE_FORMAT(c.created, '%Y-%m-%dT%TZ'),
          'userCount', dt4.userCount,
          )
          from
            (SELECT
            (select max(cg.roleId) from cteGrantees cg where cg.villageId = v.id and cg.userId = ?) as roleId,
            (select count(distinct userId) from cteGrantees where villageId = v.id) as userCount,
          ) dt4
        ) as statistics`)
        predicates.binds.push(userId)
      }
      else {
        requireCteGrantees = true
        columns.push(`(select
          json_object(
          'created', DATE_FORMAT(c.created, '%Y-%m-%dT%TZ'),
          'userCount', dt4.userCount,
          )
          from
            (SELECT
            (select count(distinct userId) from cteGrantees where villageId = v.id) as userCount,
          ) dt4
        ) as statistics`)
      }
    }
    // This projection is not exposed in the OAS, only used by Operation.getAppData()
    if (projections.includes('grants')) { 
      columns.push(`(select
        coalesce(
          (select json_arrayagg(grantJson) from
            (select
                json_object(
                  'user', json_object(
                  'userId', CAST(user_data.userId as char),
                  'username', user_data.username,
                  'displayName', COALESCE(
                    JSON_UNQUOTE(JSON_EXTRACT(user_data.lastClaims, "$.${config.oauth.claims.name}")),
                    user_data.username)),
                  'roleId', roleId)
                as grantJson
            from
              role_grant inner join user_data using (userId) where villageId = v.id
            UNION
            select
              json_object(
                'userGroup', json_object(
                  'userGroupId', CAST(user_group.userGroupId as char),
                  'name', user_group.name,
                  'description', user_group.description
                  ),
                'roleId', roleId
              ) as grantJson
            from role_grant inner join user_group using (userGroupId) where villageId = v.id
          ) as grantJsons)
        , json_array()
        )
      ) as "grants"`)
    }

    if (projections.includes('personCounts')) {
      columns.push(`(SELECT 
        JSON_OBJECT(
        'both', SUM(CASE WHEN m.id IS NOT NULL AND vol.id IS NOT NULL THEN 1 ELSE 0 END),
        'volunteer', SUM(CASE WHEN m.id IS NULL AND vol.id IS NOT NULL THEN 1 ELSE 0 END),
        'member', SUM(CASE WHEN m.id IS NOT NULL AND vol.id IS NULL THEN 1 ELSE 0 END)
      )
      FROM
        person p
        LEFT JOIN active_member m ON p.id = m.personId
        LEFT JOIN active_volunteer vol ON p.id = vol.personId
      WHERE
        p.villageId = v.id
      GROUP BY
        p.villageId) as personCounts`)
    }
    if (projections.includes('capabilityCounts')) {
      columns.push(`(SELECT 
        JSON_OBJECT(
        'errands', SUM(CASE WHEN c.name = 'Errands' THEN 1 ELSE 0 END),
        'friends', SUM(CASE WHEN c.name = 'Friends' THEN 1 ELSE 0 END),
        'homeHelp', SUM(CASE WHEN c.name = 'Home Help' THEN 1 ELSE 0 END),
        'rides', SUM(CASE WHEN c.name = 'Rides' THEN 1 ELSE 0 END),
        'techSupport', SUM(CASE WHEN c.name = 'Tech Support' THEN 1 ELSE 0 END)
      )
      FROM person p
      JOIN active_volunteer vol ON p.id = vol.personId
      JOIN volunteer_capability vc ON vol.id = vc.volunteerId
      JOIN capability c ON vc.capabilityId = c.id
      WHERE p.villageId = v.id
      GROUP BY p.villageId) as capabilityCounts`)
    }
    if (projections.includes('srStatusCounts')) {
      columns.push(`(SELECT
        JSON_OBJECT(
          'open',	SUM(CASE WHEN \`status\` = 'Open' THEN 1 ELSE 0 END),
          'confirmed',	SUM(CASE WHEN \`status\` = 'Confirmed' THEN 1 ELSE 0 END),
          'completed',	SUM(CASE WHEN \`status\` = 'Completed' THEN 1 ELSE 0 END),
          'cancelled',	SUM(CASE WHEN \`status\` LIKE '% cancelled' THEN 1 ELSE 0 END),
          'unmatched',	SUM(CASE WHEN \`status\` = 'Unmatched' THEN 1 ELSE 0 END)
        ) as sr_counts
      FROM
        village v2
        JOIN service_request sr  on v2.id = sr.villageId
      WHERE
        v2.id = v.id) as srStatusCounts`)
    }

    if (!allVillages) {
      predicates.statements.push('v.id IN (?)')
      predicates.binds.push( villageIdsGranted )
    }
    if ( filter.villageId ) {
      predicates.statements.push('v.id = ?')
      predicates.binds.push( filter.villageId )
    }

    if (requireCteGrantees) {
      const cteGranteesParams = allVillages ? {returnCte: true} : {villageIds: villageIdsGranted, returnCte: true}
      ctes.push(dbUtils.sqlGrantees(cteGranteesParams))
    }

    const sql = dbUtils.makeQueryString({ctes, columns, joins, predicates, orderBy, format: true})
    const [rows] = await dbUtils.pool.query(sql)
    return rows  
}

module.exports.getVillages = async function () {
  return await module.exports.queryVillages({allVillages: true})
}

module.exports.getVillage = async function (villageId) {
  const rows = await module.exports.queryVillages({filter: {villageId}, allVillages: true})
  return rows[0] ?? null
}

module.exports.createVillage = async function (body) {
  const insertId = await dbUtils.retryOnDeadlock2({
    transactionFn: async (connection) => {
      const mappedFields = {}
      if (body.name !== undefined) mappedFields.name = body.name

      const [result] = await connection.query('INSERT INTO village SET ?', mappedFields)
      return result.insertId
    },
    statusObj: undefined
  })
  return await module.exports.queryVillages({filter: {villageId: insertId}, allVillages: true})
}

module.exports.patchVillage = async function (villageId, body) {
  await dbUtils.retryOnDeadlock2({
    transactionFn: async (connection) => {
      const mappedFields = {}
      if (body.name !== undefined) mappedFields.name = body.name

      if (Object.keys(mappedFields).length > 0) {
        await connection.query('UPDATE village SET ? WHERE id = ?', [mappedFields, villageId])
      }
    },
    statusObj: undefined
  })
  return await module.exports.queryVillages({filter: {villageId}, allVillages: true})
}

module.exports.deleteVillage = async function (villageId) {
  await dbUtils.pool.query('DELETE FROM village WHERE id = ?', [villageId])
}

module.exports.getVillageMembers = async function (villageId) {
  const columns = [
    'p.fullName',
    'CAST(m.id AS CHAR) AS memberId',
    'CAST(m.personId AS CHAR) AS personId',
    'm.memberNumber',
    'm.memberLevel',
    'm.serviceNotes',
    'DATE_FORMAT(m.joinDate, "%Y-%m-%d") AS joinDate'
  ]
  const joins = new Set([
    'active_member m',
    'JOIN person p ON p.id = m.personId'
  ])
  const predicates = { statements: ['p.villageId = ?'], binds: [villageId] }
  const orderBy = ['p.fullName']
  const sql = dbUtils.makeQueryString({columns, joins, predicates, orderBy, format: true})
  const [rows] = await dbUtils.pool.query(sql)
  return rows
}

module.exports.getVillageVolunteers = async function (villageId) {
  const columns = [
    'p.fullName',
    'CAST(vol.id AS CHAR) AS volunteerId',
    'CAST(vol.personId AS CHAR) AS personId',
  `  COALESCE(CAST(
      CONCAT('[', GROUP_CONCAT(CONCAT('"',c.name,'"') ORDER BY c.name), ']')
      AS JSON), JSON_ARRAY()) AS capabilities`
  ]
  const joins = new Set([
    'active_volunteer vol',
    'JOIN person p ON p.id = vol.personId',
    'LEFT JOIN volunteer_capability vc ON vc.volunteerId = vol.id',
    'LEFT JOIN capability c ON c.id = vc.capabilityId'
  ])
  const predicates = { statements: ['p.villageId = ?'], binds: [villageId] }
  const groupBy = ['vol.id']
  const orderBy = ['p.fullName']
  const sql = dbUtils.makeQueryString({columns, joins, predicates, groupBy, orderBy, format: true})
  let [rows] = await dbUtils.pool.query(sql)
  return rows
}

module.exports.getVolunteers = async function ({ villageIdsGranted, allVillages }) {
  const columns = [
    'p.fullName',
    'CAST(vol.id AS CHAR) AS volunteerId',
    'CAST(vol.personId AS CHAR) AS personId',
  `  COALESCE(CAST(
      CONCAT('[', GROUP_CONCAT(CONCAT('"',c.name,'"') ORDER BY c.name), ']')
      AS JSON), JSON_ARRAY()) AS capabilities`
  ]
  const joins = new Set([
    'active_volunteer vol',
    'JOIN person p ON p.id = vol.personId',
    'LEFT JOIN volunteer_capability vc ON vc.volunteerId = vol.id',
    'LEFT JOIN capability c ON c.id = vc.capabilityId'
  ])
  const predicates = { statements: [], binds: [] }
  if (!allVillages) {
    if (!villageIdsGranted.length) return []
    predicates.statements.push('p.villageId IN (?)')
    predicates.binds.push(villageIdsGranted)
  }
  const groupBy = ['vol.id']
  const orderBy = ['p.fullName']
  const sql = dbUtils.makeQueryString({columns, joins, predicates, groupBy, orderBy, format: true})
  const [rows] = await dbUtils.pool.query(sql)
  return rows
}

module.exports.getVillagePersons = async function (villageId) {
  return await PersonService.getPersonsByVillage(villageId)
}

module.exports.getVillagePerson = async function (villageId, personId) {
  const persons = await PersonService.getPersonsByVillage(villageId)
  return persons.find(p => p.personId === personId) || null
}

module.exports.getVillageServiceRequests = async function (villageId, status) {
  const columns = [
    'CAST(sr.id AS CHAR) AS serviceRequestId',
    'sr.requestNumber',
    'CAST(sr.villageId AS CHAR) AS villageId',
    'CAST(sr.memberPersonId AS CHAR) AS memberPersonId',
    'CAST(m.id AS CHAR) AS memberId',
    'mp.fullName AS memberFullName',
    'CAST(sr.volunteerPersonId AS CHAR) AS volunteerPersonId',
    'CAST(vol.id AS CHAR) AS volunteerId',
    'vp.fullName AS volunteerFullName',
    'sr.status AS status',
    'sr.serviceName',
    'sr.transportationType',
    "DATE_FORMAT(sr.createdAt, '%Y-%m-%dT%TZ') AS createdAt",
    "DATE_FORMAT(sr.startAt, '%Y-%m-%dT%TZ') AS startAt",
    "DATE_FORMAT(sr.apptTime, '%Y-%m-%dT%TZ') AS apptTime",
    "DATE_FORMAT(sr.returnTime, '%Y-%m-%dT%TZ') AS returnTime",
    "DATE_FORMAT(sr.finishAt, '%Y-%m-%dT%TZ') AS finishAt",
    'sr.instructions AS instructions',
    'sr.description AS description',
    'sr.destination AS destination',
    'sr.address AS address',
    'sr.city AS city',
    'sr.phone AS phone',
    `COALESCE(
      (SELECT ${dbUtils.jsonArrayAggDistinct('JSON_QUOTE(ne.eventType)')}
       FROM notification_event ne
       WHERE ne.serviceRequestId = sr.id),
      JSON_ARRAY()
    ) AS notifications`
  ]
  const joins = new Set([
    'service_request sr',
    'LEFT JOIN member m ON sr.memberPersonId = m.personId',
    'LEFT JOIN person mp ON sr.memberPersonId = mp.id',
    'LEFT JOIN volunteer vol ON sr.volunteerPersonId = vol.personId',
    'LEFT JOIN person vp ON sr.volunteerPersonId = vp.id'
  ])
  const predicates = { statements: ['sr.villageId = ?'], binds: [villageId] }
  if (status && status.length > 0) {
    const dbStatuses = []
    for (const s of status) {
      if (s === 'open') dbStatuses.push('Open')
      else if (s === 'confirmed') dbStatuses.push('Confirmed')
      else if (s === 'completed') dbStatuses.push('Completed')
      else if (s === 'unmatched') dbStatuses.push('Unmatched')
      else if (s === 'cancelled') {
        dbStatuses.push('Member cancelled', 'Volunteer cancelled')
      }
    }
    if (dbStatuses.length > 0) {
      predicates.statements.push('sr.status IN ?')
      predicates.binds.push([dbStatuses])
    }
  }
  const orderBy = ['sr.finishAt DESC']
  const sql = dbUtils.makeQueryString({columns, joins, predicates, orderBy, format: true})
  let [rows] = await dbUtils.pool.query(sql)
  return rows
}

module.exports.getVillageGrants = async function (villageId) {
  const sql = `
    SELECT
      CAST(vg.grantId AS CHAR) AS grantId,
      vg.roleId,
      CAST(vg.userId AS CHAR) AS userId,
      CAST(vg.userGroupId AS CHAR) AS userGroupId,
      CASE
        WHEN vg.userId IS NOT NULL THEN 'user'
        WHEN vg.userGroupId IS NOT NULL THEN 'userGroup'
      END AS grantType,
      CAST(ud.userId AS CHAR) AS user_userId,
      ud.username AS user_username,
      COALESCE(
        JSON_UNQUOTE(JSON_EXTRACT(ud.lastClaims, "$.${config.oauth.claims.name}")),
        ud.username
      ) AS user_displayName,
      CAST(ug.userGroupId AS CHAR) AS userGroup_userGroupId,
      ug.name AS userGroup_name,
      ug.description AS userGroup_description
    FROM role_grant vg
    LEFT JOIN user_data ud ON vg.userId = ud.userId
    LEFT JOIN user_group ug ON vg.userGroupId = ug.userGroupId
    WHERE vg.villageId = ?
    ORDER BY vg.grantId
  `
  const [rows] = await dbUtils.pool.query(sql, [villageId])

  return rows.map(row => {
    if (row.grantType === 'user') {
      return {
        grantId: row.grantId,
        roleId: row.roleId,
        user: {
          userId: row.user_userId,
          username: row.user_username,
          displayName: row.user_displayName
        }
      }
    } else {
      return {
        grantId: row.grantId,
        roleId: row.roleId,
        userGroup: {
          userGroupId: row.userGroup_userGroupId,
          name: row.userGroup_name,
          description: row.userGroup_description
        }
      }
    }
  })
}

module.exports.createVillageGrant = async function (villageId, body) {
  const grantsArray = Array.isArray(body) ? body : [body]

  await dbUtils.retryOnDeadlock2({
    transactionFn: async (connection) => {
      for (const grant of grantsArray) {
        const mappedFields = {
          villageId,
          roleId: grant.roleId
        }

        if (grant.userId !== undefined) {
          mappedFields.userId = grant.userId
        } else if (grant.userGroupId !== undefined) {
          mappedFields.userGroupId = grant.userGroupId
        }

        await connection.query('INSERT INTO role_grant SET ?', mappedFields)
      }
    },
    statusObj: undefined
  })

  const grants = await module.exports.getVillageGrants(villageId)
  return grants
}

module.exports.replaceVillageGrants = async function (villageId, body) {
  await dbUtils.retryOnDeadlock2({
    transactionFn: async (connection) => {
      await connection.query('DELETE FROM role_grant WHERE villageId = ?', [villageId])

      if (body && body.length > 0) {
        for (const grant of body) {
          const mappedFields = {
            villageId,
            roleId: grant.roleId
          }

          if (grant.userId !== undefined) {
            mappedFields.userId = grant.userId
          } else if (grant.userGroupId !== undefined) {
            mappedFields.userGroupId = grant.userGroupId
          }

          await connection.query('INSERT INTO role_grant SET ?', mappedFields)
        }
      }
    },
    statusObj: undefined
  })

  return await module.exports.getVillageGrants(villageId)
}

module.exports.deleteVillageGrant = async function (villageId, grantId) {
  const [existing] = await dbUtils.pool.query(
    'SELECT * FROM role_grant WHERE grantId = ? AND villageId = ?',
    [grantId, villageId]
  )

  if (!existing || existing.length === 0) {
    const SmError = require('../utils/error')
    throw new SmError.NotFoundError()
  }

  await dbUtils.pool.query('DELETE FROM role_grant WHERE grantId = ? AND villageId = ?', [grantId, villageId])

  const sql = `
    SELECT
      CAST(? AS CHAR) AS grantId,
      ? AS roleId,
      CASE
        WHEN ? IS NOT NULL THEN 'user'
        WHEN ? IS NOT NULL THEN 'userGroup'
      END AS grantType,
      CAST(ud.userId AS CHAR) AS user_userId,
      ud.username AS user_username,
      COALESCE(
        JSON_UNQUOTE(JSON_EXTRACT(ud.lastClaims, "$.${config.oauth.claims.name}")),
        ud.username
      ) AS user_displayName,
      CAST(ug.userGroupId AS CHAR) AS userGroup_userGroupId,
      ug.name AS userGroup_name,
      ug.description AS userGroup_description
    FROM (SELECT 1) dummy
    LEFT JOIN user_data ud ON ud.userId = ?
    LEFT JOIN user_group ug ON ug.userGroupId = ?
  `
  const [rows] = await dbUtils.pool.query(sql, [
    grantId,
    existing[0].roleId,
    existing[0].userId,
    existing[0].userGroupId,
    existing[0].userId,
    existing[0].userGroupId
  ])

  const row = rows[0]
  if (row.grantType === 'user') {
    return {
      grantId: row.grantId,
      roleId: row.roleId,
      user: {
        userId: row.user_userId,
        username: row.user_username,
        displayName: row.user_displayName
      }
    }
  } else {
    return {
      grantId: row.grantId,
      roleId: row.roleId,
      userGroup: {
        userGroupId: row.userGroup_userGroupId,
        name: row.userGroup_name,
        description: row.userGroup_description
      }
    }
  }
}
