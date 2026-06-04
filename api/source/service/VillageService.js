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

    if (projections.includes('personCounts')) {
      columns.push(`(SELECT 
        JSON_OBJECT(
        'both', SUM(CASE WHEN m.id IS NOT NULL AND vol.id IS NOT NULL THEN 1 ELSE 0 END),
        'volunteer', SUM(CASE WHEN m.id IS NULL AND vol.id IS NOT NULL THEN 1 ELSE 0 END),
        'member', SUM(CASE WHEN m.id IS NOT NULL AND vol.id IS NULL THEN 1 ELSE 0 END)
      )
      FROM
        person p
        LEFT JOIN member m ON p.id = m.person_id
        LEFT JOIN volunteer vol ON p.id = vol.person_id
      WHERE
        p.village_id = v.id
      GROUP BY
        p.village_id) as personCounts`)
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
    'p.full_name AS fullName',
    'm.member_number AS memberNumber',
    'm.member_level AS memberLevel',
    'm.service_notes AS serviceNotes',
    'm.join_date AS joinDate'
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

module.exports.getVillagePerson = async function (villageId, personId) {
  const persons = await PersonService.getPersonsByVillage(villageId)
  return persons.find(p => p.personId === personId) || null
}

module.exports.getVillageServiceRequests = async function (villageId, status) {
  const columns = [
    'CAST(sr.id AS CHAR) AS serviceRequestId',
    'sr.request_number AS requestNumber',
    'CAST(sr.village_id AS CHAR) AS villageId',
    'CAST(sr.member_person_id AS CHAR) AS memberPersonId',
    'CAST(m.id AS CHAR) AS memberId',
    'mp.full_name AS memberFullName',
    'CAST(sr.volunteer_person_id AS CHAR) AS volunteerPersonId',
    'CAST(vol.id AS CHAR) AS volunteerId',
    'vp.full_name AS volunteerFullName',
    'sr.status AS status',
    'sr.service_name AS serviceName',
    'sr.transportation_type AS transportationType',
    "DATE_FORMAT(sr.created_at, '%Y-%m-%dT%TZ') AS createdAt",
    "DATE_FORMAT(sr.start_at, '%Y-%m-%dT%TZ') AS startAt",
    "DATE_FORMAT(sr.finish_at, '%Y-%m-%dT%TZ') AS finishAt",
    'sr.instructions AS instructions',
    'sr.description AS description',
    'sr.destination AS destination',
    'sr.address AS address',
    'sr.city AS city',
    'sr.phone AS phone'
  ]
  const joins = new Set([
    'service_request sr',
    'LEFT JOIN member m ON sr.member_person_id = m.person_id',
    'LEFT JOIN person mp ON sr.member_person_id = mp.id',
    'LEFT JOIN volunteer vol ON sr.volunteer_person_id = vol.person_id',
    'LEFT JOIN person vp ON sr.volunteer_person_id = vp.id'
  ])
  const predicates = { statements: ['sr.village_id = ?'], binds: [villageId] }
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
  const orderBy = ['sr.finish_at DESC']
  const sql = dbUtils.makeQueryString({columns, joins, predicates, orderBy, format: true})
  let [rows] = await dbUtils.pool.query(sql)
  return rows
}
