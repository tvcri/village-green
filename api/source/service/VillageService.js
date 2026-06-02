'use strict';
const dbUtils = require('./utils')
const PersonService = require('./PersonService')
const config = require('../utils/config')

const _this = this

module.exports.queryVillages = async function  ({projections = [], filter = {}, elevate = false, grants = {}, userId = ''}) {  
    const villageIdsGranted = Object.keys(grants)
    if (!villageIdsGranted.length && !elevate) {
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

    if (!elevate) {
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
          village_grant inner join user_data using (userId) where villageId = v.id and roleId = 4
        UNION
        select json_object(
          'userGroupId', CAST(user_group.userGroupId as char),
          'name', user_group.name,
          'description', user_group.description
        ) as grantJson
        from village_grant inner join user_group using (userGroupId) where villageId = v.id and roleId = 4) o) as owners`)
    }
    if (projections.includes('statistics')) {
      if (!elevate) {
        requireCteGrantees = true
        columns.push(`(select
          json_object(
          'created', DATE_FORMAT(c.created, '%Y-%m-%dT%TZ'),
          'userCount', dt4.userCount,
          )
          from 
            (SELECT
            (select roleId from cteGrantees where villageId = v.id and userId = ?) as roleId,
            (select count(userId) from cteGrantees where villageId = v.id) as userCount,
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
            (select count(userId) from cteGrantees where villageId = v.id) as userCount,
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
              village_grant inner join user_data using (userId) where villageId = v.id
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
            from village_grant inner join user_group using (userGroupId) where villageId = v.id
          ) as grantJsons)
        , json_array()
        )
      ) as "grants"`)
    }


    if (!elevate) {
      predicates.statements.push('v.id IN (?)')
      predicates.binds.push( villageIdsGranted )
    }
    if ( filter.villageId ) {
      predicates.statements.push('v.id = ?')
      predicates.binds.push( filter.villageId )
    }

    if (requireCteGrantees) {
      const cteGranteesParams = elevate ? {returnCte: true} : {villageIds: villageIdsGranted, returnCte: true}
      ctes.push(dbUtils.sqlGrantees(cteGranteesParams))
    }

    const sql = dbUtils.makeQueryString({ctes, columns, joins, predicates, orderBy, format: true})
    const [rows] = await dbUtils.pool.query(sql)
    return rows  
}

module.exports.getVillages = async function () {
  return await module.exports.queryVillages({})
}

module.exports.getVillage = async function (villageId) {
  const rows = await module.exports.queryVillages({villageId})
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
  return await queryVillages({villageId: insertId})
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
  return await queryVillages({villageId})
}

module.exports.deleteVillage = async function (villageId) {
  await dbUtils.pool.query('DELETE FROM village WHERE id = ?', [villageId])
}

module.exports.getVillageMembers = async function (villageId) {
  const columns = [
    'p.full_name AS fullName',
    'CAST(m.id AS CHAR) AS memberId',
    'CAST(m.person_id AS CHAR) AS personId',
    'm.member_number AS memberNumber',
    'm.member_level AS memberLevel',
    'm.service_notes AS serviceNotes',
    'm.emergency_contact_name AS emergencyContactName',
    'm.emergency_contact_relationship AS emergencyContactRelationship',
    'm.emergency_contact_phone AS emergencyContactPhone',
    'm.emergency_contact_email AS emergencyContactEmail'
  ]
  const joins = new Set([
    'member m',
    'JOIN person p ON p.id = m.person_id'
  ])
  const predicates = { statements: ['p.village_id = ?'], binds: [villageId] }
  const orderBy = ['p.full_name']
  const sql = dbUtils.makeQueryString({columns, joins, predicates, orderBy, format: true})
  const [rows] = await dbUtils.pool.query(sql)
  return rows
}

module.exports.getVillageVolunteers = async function (villageId) {
  const columns = [
    'p.full_name AS fullName',
    'CAST(vol.id AS CHAR) AS volunteerId',
    'CAST(vol.person_id AS CHAR) AS personId',
    'vol.emergency_phone AS emergencyPhone',
  `  COALESCE(CAST(
      CONCAT('[', GROUP_CONCAT(CONCAT('"',c.name,'"') ORDER BY c.name), ']')
      AS JSON), JSON_ARRAY()) AS capabilities`
  ]
  const joins = new Set([
    'volunteer vol',
    'JOIN person p ON p.id = vol.person_id',
    'LEFT JOIN volunteer_capability vc ON vc.volunteer_id = vol.id',
    'LEFT JOIN capability c ON c.id = vc.capability_id'
  ])
  const predicates = { statements: ['p.village_id = ?'], binds: [villageId] }
  const groupBy = ['vol.id']
  const orderBy = ['p.full_name']
  const sql = dbUtils.makeQueryString({columns, joins, predicates, groupBy, orderBy, format: true})
  let [rows] = await dbUtils.pool.query(sql)
  return rows
}

module.exports.getVillagePersons = async function (villageId) {
  return await PersonService.getPersonsByVillage(villageId)
}
