'use strict'

const mysql = require('mysql2/promise')
const dbUtils = require('./utils')
const ServiceRequestService = require('./ServiceRequestService')

// The volunteer-facing read shape. The disclosure ceiling for the member
// block is what the open-broadcast emails already send (VSS design spec §3).
function baseColumns() {
  return [
    'CAST(sr.id AS CHAR) AS serviceRequestId',
    'CAST(sr.villageId AS CHAR) AS villageId',
    'v.name AS villageName',
    'sr.status AS status',
    'sr.serviceName',
    'sr.transportationType',
    "DATE_FORMAT(sr.createdAt, '%Y-%m-%dT%TZ') AS createdAt",
    "DATE_FORMAT(sr.startAt, '%Y-%m-%dT%TZ') AS startAt",
    "DATE_FORMAT(sr.finishAt, '%Y-%m-%dT%TZ') AS finishAt",
    "DATE_FORMAT(sr.apptTime, '%Y-%m-%dT%TZ') AS apptTime",
    "DATE_FORMAT(sr.returnTime, '%Y-%m-%dT%TZ') AS returnTime",
    'sr.instructions AS instructions',
    'sr.description AS description',
    'sr.destination AS destination',
    'sr.address AS address',
    'sr.city AS city',
    'sr.state AS state',
    'sr.zip AS zip',
    'sr.phone AS phone',
    `IF(sr.memberPersonId IS NOT NULL, JSON_OBJECT(
      'fullName', mp.fullName,
      'address', mp.address,
      'city', mp.city,
      'state', mp.state,
      'zip', LPAD(mp.zip, 5, '0'),
      'phone', mp.phone,
      'cell', mp.cell
    ), NULL) AS member`,
  ]
}

// Emergency contact is reserved for the volunteer confirmed on the request.
function emergencyContactColumn(ownershipSql) {
  return `IF(${ownershipSql}, JSON_OBJECT(
    'name', mp.emergencyContactName,
    'relationship', mp.emergencyContactRelationship,
    'phone', mp.emergencyContactPhone
  ), NULL) AS emergencyContact`
}

function baseJoins() {
  return new Set([
    'service_request sr',
    'JOIN village v ON sr.villageId = v.id',
    'LEFT JOIN person mp ON sr.memberPersonId = mp.id',
  ])
}

// Pure classifiers for a failed atomic UPDATE (row read back in the same
// transaction). Visibility (the caller's volunteer villages) decides
// notFound vs conflict so out-of-scope ids don't leak existence.
module.exports.classifyPickupFailure = function ({ row, personId, villageIds }) {
  if (!row || !villageIds.includes(String(row.villageId))) return 'notFound'
  if (row.status === 'Confirmed' && String(row.volunteerPersonId) === String(personId)) return 'alreadyOwn'
  return 'conflict'
}

module.exports.classifyReleaseFailure = function ({ row, villageIds }) {
  if (!row || !villageIds.includes(String(row.villageId))) return 'notFound'
  return 'conflict'
}

module.exports.getVolunteerRequests = async function ({ scope, personId, villageIds }) {
  const columns = baseColumns()
  const joins = baseJoins()
  const predicates = { statements: [], binds: [] }

  if (scope === 'open') {
    if (!villageIds.length) return []
    predicates.statements.push("sr.status = 'Open'", 'sr.villageId IN (?)')
    predicates.binds.push(villageIds)
  } else {
    columns.push(emergencyContactColumn("sr.status = 'Confirmed'"))
    predicates.statements.push('sr.volunteerPersonId = ?', "sr.status IN ('Confirmed', 'Completed')")
    predicates.binds.push(personId)
  }

  const orderBy = ['sr.startAt ASC']
  const sql = dbUtils.makeQueryString({ columns, joins, predicates, orderBy, format: true })
  const [rows] = await dbUtils.pool.query(sql)
  return rows
}

module.exports.getVolunteerRequest = async function ({ serviceRequestId, personId }) {
  const columns = baseColumns()
  // personId is an integer from our own DB; escaped inline because
  // makeQueryString applies binds to predicates only (NAME_CLAIM_PATH pattern).
  columns.push(emergencyContactColumn(
    `sr.status = 'Confirmed' AND sr.volunteerPersonId = ${mysql.escape(personId)}`
  ))
  const joins = baseJoins()
  const predicates = { statements: ['sr.id = ?'], binds: [serviceRequestId] }
  const sql = dbUtils.makeQueryString({ columns, joins, predicates, format: true })
  const [rows] = await dbUtils.pool.query(sql)
  return rows[0] ?? null
}

module.exports.pickupVolunteerRequest = async function ({ serviceRequestId, personId, userId, villageIds }) {
  return dbUtils.retryOnDeadlock2({
    transactionFn: async (connection) => {
      // Atomic first-wins: only an unassigned Open request in the caller's
      // volunteer village(s) can be picked up.
      const [result] = await connection.query(
        `UPDATE service_request
         SET volunteerPersonId = ?, status = 'Confirmed', modifiedUserId = ?, modifiedAt = UTC_TIMESTAMP()
         WHERE id = ? AND status = 'Open' AND volunteerPersonId IS NULL AND villageId IN (?)`,
        [personId, userId, serviceRequestId, villageIds]
      )
      if (result.affectedRows === 1) {
        await ServiceRequestService.writeNotificationEvent(connection, serviceRequestId, 'Confirmed')
        return { outcome: 'confirmed' }
      }
      const [rows] = await connection.query(
        'SELECT status, volunteerPersonId, villageId FROM service_request WHERE id = ?',
        [serviceRequestId]
      )
      return { outcome: module.exports.classifyPickupFailure({ row: rows[0], personId, villageIds }) }
    },
  })
}

module.exports.releaseVolunteerRequest = async function ({ serviceRequestId, personId, userId, villageIds }) {
  return dbUtils.retryOnDeadlock2({
    transactionFn: async (connection) => {
      const [result] = await connection.query(
        `UPDATE service_request
         SET volunteerPersonId = NULL, status = 'Open', modifiedUserId = ?, modifiedAt = UTC_TIMESTAMP()
         WHERE id = ? AND status = 'Confirmed' AND volunteerPersonId = ?`,
        [userId, serviceRequestId, personId]
      )
      if (result.affectedRows === 1) {
        // Re-broadcast to the volunteer list. The member is deliberately NOT
        // notified: the service is back to seeking, not cancelled (spec §3).
        await ServiceRequestService.writeNotificationEvent(connection, serviceRequestId, 'Open')
        return { outcome: 'released' }
      }
      const [rows] = await connection.query(
        'SELECT status, volunteerPersonId, villageId FROM service_request WHERE id = ?',
        [serviceRequestId]
      )
      return { outcome: module.exports.classifyReleaseFailure({ row: rows[0], villageIds }) }
    },
  })
}
