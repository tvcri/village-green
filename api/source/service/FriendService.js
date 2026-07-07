'use strict';

const dbUtils = require('./utils')

module.exports.getFriends = async function ({ villageIdsGranted, elevate, villageId, volunteerPersonId, memberPersonId, dateStart, dateEnd, contactType, activityType, volunteerName, memberName }) {
  const columns = [
    'CAST(fcv.id AS CHAR) AS friendId',
    "DATE_FORMAT(fcv.visitDate, '%Y-%m-%d') AS visitDate",
    'fcv.timeSpentMinutes',
    'fcv.contactType',
    'fcv.activityTypes',
    'fcv.activityOther',
    'fcv.notes',
    'fcv.submittedAt',
    `IF(fcv.villageId IS NOT NULL,
      JSON_OBJECT('villageId', CAST(v.id AS CHAR), 'name', v.name),
      NULL
    ) AS village`,
    `IF(fcv.volunteerPersonId IS NOT NULL,
      JSON_OBJECT('personId', CAST(pv.id AS CHAR), 'fullName', pv.fullName),
      JSON_OBJECT('rawName', fcv.rawVolunteerName)
    ) AS volunteer`,
    `IF(fcv.memberPersonId IS NOT NULL,
      JSON_OBJECT('personId', CAST(pm.id AS CHAR), 'fullName', pm.fullName),
      JSON_OBJECT('rawName', fcv.rawMemberName)
    ) AS member`
  ]
  const joins = new Set([
    'fcv_submission fcv',
    'LEFT JOIN village v ON v.id = fcv.villageId',
    'LEFT JOIN person pv ON pv.id = fcv.volunteerPersonId',
    'LEFT JOIN person pm ON pm.id = fcv.memberPersonId'
  ])
  const predicates = { statements: [], binds: [] }

  if (!elevate) {
    if (!villageIdsGranted.length) return []
    predicates.statements.push('fcv.villageId IN (?)')
    predicates.binds.push(villageIdsGranted)
  }
  if (villageId && villageId.length > 0) {
    predicates.statements.push('fcv.villageId IN (?)')
    predicates.binds.push([villageId])
  }
  if (volunteerPersonId) {
    predicates.statements.push('fcv.volunteerPersonId = ?')
    predicates.binds.push(volunteerPersonId)
  }
  if (memberPersonId) {
    predicates.statements.push('fcv.memberPersonId = ?')
    predicates.binds.push(memberPersonId)
  }
  if (dateStart) {
    predicates.statements.push('fcv.visitDate >= ?')
    predicates.binds.push(dateStart)
  }
  if (dateEnd) {
    predicates.statements.push('fcv.visitDate <= ?')
    predicates.binds.push(dateEnd)
  }
  if (contactType) {
    predicates.statements.push('fcv.contactType = ?')
    predicates.binds.push(contactType)
  }
  if (activityType) {
    predicates.statements.push('JSON_CONTAINS(fcv.activityTypes, JSON_QUOTE(?))')
    predicates.binds.push(activityType)
  }
  if (volunteerName) {
    predicates.statements.push('(pv.fullName LIKE ? OR fcv.rawVolunteerName LIKE ?)')
    predicates.binds.push(`%${volunteerName}%`, `%${volunteerName}%`)
  }
  if (memberName) {
    predicates.statements.push('(pm.fullName LIKE ? OR fcv.rawMemberName LIKE ?)')
    predicates.binds.push(`%${memberName}%`, `%${memberName}%`)
  }

  const orderBy = ['fcv.visitDate DESC', 'fcv.id DESC']
  const sql = dbUtils.makeQueryString({ columns, joins, predicates, orderBy, format: true })
  const [rows] = await dbUtils.pool.query(sql)
  return rows
}
