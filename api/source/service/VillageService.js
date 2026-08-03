'use strict';
const dbUtils = require('./utils')
const PersonService = require('./PersonService')
const config = require('../utils/config')

const _this = this

module.exports.queryVillages = async function  ({projections = [], filter = {}, allVillages = false, grants = {}}) {
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

    if (projections.includes('statistics')) {
      requireCteGrantees = true
      columns.push(`json_object(
        'userCount', (select count(distinct userId) from cteGrantees where villageId = v.id)
      ) as statistics`)
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

module.exports.getVolunteers = async function ({ villageIdsGranted }) {
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
  if (villageIdsGranted) {
    // Non-federation caller: restrict to the villages they were granted
    // volunteer:read in. A null villageIdsGranted means a federation-wide
    // read, which is unrestricted here (same sentinel as
    // PersonService.queryPersons).
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

module.exports.getVillageMetrics = async function (villageId, start, end) {
  // Business rule: metrics report on TERMINAL requests only — see
  // dbUtils.TERMINAL_SR_STATUSES. 'Open'/'Confirmed' are still in flight and
  // would make a report irreproducible; 'Hub cancelled' is treated as if it
  // never existed. byMember/byVolunteer count Completed only;
  // byStatus/byServiceType/byCategory carry the full terminal mix.
  // Breakdown arrays are ordered in SQL (jsonArrayAgg orderBy).
  const statusJson = (alias) => `JSON_OBJECT(
    'completed',          COALESCE(SUM(${alias}.status = 'Completed'), 0),
    'unmatched',          COALESCE(SUM(${alias}.status = 'Unmatched'), 0),
    'memberCancelled',    COALESCE(SUM(${alias}.status = 'Member cancelled'), 0),
    'volunteerCancelled', COALESCE(SUM(${alias}.status = 'Volunteer cancelled'), 0)
  )`
  const categoryCase = dbUtils.buildServiceNameCategoryCase('sr.serviceName')
  const ridePrefix = dbUtils.SERVICE_CATEGORIES.find(c => c.category === 'Rides').match.prefix
  // Legacy "2 legs" basis for the client-side legs toggle: completed
  // round-trip RIDES only — the sheet's counter never doubled non-ride
  // round trips, which do exist in live data.
  const roundTripSum = (alias) =>
    `COALESCE(SUM(${alias}.status = 'Completed' AND ${alias}.transportationType = 'Round Trip' AND ${alias}.serviceName LIKE '${ridePrefix}%'), 0)`
  const sql = `
    SELECT
      CAST(v.id AS CHAR) AS villageId,
      v.name AS villageName,
      (SELECT ${statusJson('sr')}
        FROM service_request sr
        WHERE sr.villageId = v.id
          AND ${dbUtils.sqlTerminalStatus('sr.status')}
          AND sr.serviceDate BETWEEN ? AND ?) AS byStatus,
      (SELECT ${roundTripSum('sr')}
        FROM service_request sr
        WHERE sr.villageId = v.id
          AND ${dbUtils.sqlTerminalStatus('sr.status')}
          AND sr.serviceDate BETWEEN ? AND ?) AS totalsRoundTrips,
      (SELECT COALESCE(
          ${dbUtils.jsonArrayAgg({
            value: `JSON_OBJECT('serviceName', t.serviceName, 'category', t.category, 'byStatus', t.statusCounts, 'completedRoundTrips', t.rt)`,
            orderBy: `JSON_EXTRACT(t.statusCounts, '$.completed') DESC, t.serviceName`
          })}, JSON_ARRAY())
        FROM (SELECT sr.serviceName, ${categoryCase} AS category, ${statusJson('sr')} AS statusCounts, ${roundTripSum('sr')} AS rt
              FROM service_request sr
              WHERE sr.villageId = v.id
                AND ${dbUtils.sqlTerminalStatus('sr.status')}
                AND sr.serviceName IS NOT NULL
                AND sr.serviceDate BETWEEN ? AND ?
              GROUP BY sr.serviceName) t) AS byServiceType,
      (SELECT COALESCE(
          ${dbUtils.jsonArrayAgg({
            value: `JSON_OBJECT('category', t.category, 'byStatus', t.statusCounts, 'completedRoundTrips', t.rt)`,
            orderBy: 't.category'
          })}, JSON_ARRAY())
        FROM (SELECT ${categoryCase} AS category, ${statusJson('sr')} AS statusCounts, ${roundTripSum('sr')} AS rt
              FROM service_request sr
              WHERE sr.villageId = v.id
                AND ${dbUtils.sqlTerminalStatus('sr.status')}
                AND sr.serviceName IS NOT NULL
                AND sr.serviceDate BETWEEN ? AND ?
              GROUP BY 1
              HAVING category IS NOT NULL) t) AS byCategoryRaw,
      (SELECT COALESCE(
          ${dbUtils.jsonArrayAgg({
            value: `JSON_OBJECT('personId', CAST(p.id AS CHAR), 'fullName', p.fullName, 'count', t.cnt, 'completedRoundTrips', t.rt)`,
            orderBy: 'p.fullName'
          })}, JSON_ARRAY())
        FROM (SELECT sr.memberPersonId AS pid, COUNT(*) AS cnt, ${roundTripSum('sr')} AS rt
              FROM service_request sr
              WHERE sr.villageId = v.id
                AND sr.status = 'Completed'
                AND sr.memberPersonId IS NOT NULL
                AND sr.serviceDate BETWEEN ? AND ?
              GROUP BY sr.memberPersonId) t
        JOIN person p ON p.id = t.pid) AS byMember,
      (SELECT COALESCE(
          ${dbUtils.jsonArrayAgg({
            value: `JSON_OBJECT('personId', CAST(p.id AS CHAR), 'fullName', p.fullName, 'count', t.cnt, 'completedRoundTrips', t.rt)`,
            orderBy: 'p.fullName'
          })}, JSON_ARRAY())
        FROM (SELECT sr.volunteerPersonId AS pid, COUNT(*) AS cnt, ${roundTripSum('sr')} AS rt
              FROM service_request sr
              WHERE sr.villageId = v.id
                AND sr.status = 'Completed'
                AND sr.volunteerPersonId IS NOT NULL
                AND sr.serviceDate BETWEEN ? AND ?
              GROUP BY sr.volunteerPersonId) t
        JOIN person p ON p.id = t.pid) AS byVolunteer
    FROM village v
    WHERE v.id = ?
  `
  const binds = [start, end, start, end, start, end, start, end, start, end, start, end, villageId]
  const [rows] = await dbUtils.pool.query(sql, binds)
  if (!rows[0]) return null
  const row = rows[0]
  // Fixed 5-entry byCategory in vocabulary order, zero-filled: chart colors
  // and shapes stay stable regardless of which categories have data.
  const zeroStatus = { completed: 0, unmatched: 0,
    memberCancelled: 0, volunteerCancelled: 0 }
  const found = new Map((row.byCategoryRaw ?? []).map(e => [e.category, e]))
  const byCategory = dbUtils.SERVICE_CATEGORIES.map(({ category }) => {
    const e = found.get(category)
    return { category, byStatus: e?.byStatus ?? { ...zeroStatus }, completedRoundTrips: e?.completedRoundTrips ?? 0 }
  })
  const totalRequests = Object.values(row.byStatus).reduce((a, b) => a + b, 0)
  return {
    villageId: row.villageId,
    villageName: row.villageName,
    range: { start, end },
    totals: { totalRequests, byStatus: row.byStatus, completedRoundTrips: row.totalsRoundTrips },
    byCategory,
    byServiceType: row.byServiceType,
    byMember: row.byMember,
    byVolunteer: row.byVolunteer
  }
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
