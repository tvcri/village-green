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

// Emergency contact mirrors the email precedent exactly (vg-email-sidecar
// templates.js): the Open broadcast email never includes it — nobody owns
// the request yet — only the Confirmed email does. Once a volunteer owns a
// request, it stays visible for that owner in both Confirmed and Completed
// (no further distinction by status once owned).
function emergencyContactColumn(ownershipSql) {
  return `IF(${ownershipSql}, JSON_OBJECT(
    'name', mp.emergencyContactName,
    'relationship', mp.emergencyContactRelationship,
    'phone', mp.emergencyContactPhone
  ), NULL) AS emergencyContact`
}

// The volunteer's own address, for the caller's own map (volunteer -> member
// -> destination). Not a new disclosure — it's the caller's own record —
// but gated the same ownership rule as emergencyContact to keep Open rows clean.
function volunteerAddressColumn(ownershipSql) {
  return `IF(${ownershipSql}, JSON_OBJECT(
    'address', vp.address,
    'city', vp.city,
    'state', vp.state,
    'zip', LPAD(vp.zip, 5, '0')
  ), NULL) AS volunteerAddress`
}

function baseJoins() {
  return new Set([
    'service_request sr',
    'JOIN village v ON sr.villageId = v.id',
    'LEFT JOIN person mp ON sr.memberPersonId = mp.id',
    'LEFT JOIN person vp ON sr.volunteerPersonId = vp.id',
  ])
}

// Pure classifiers for a failed atomic UPDATE (row read back in the same
// transaction). Any active volunteer can see and act on any village's
// requests (VSS design refinement: cross-village visibility/sign-up), so
// only existence — not village membership — decides notFound vs conflict.
module.exports.classifySignUpFailure = function ({ row, personId }) {
  if (!row) return 'notFound'
  if (row.status === 'Confirmed' && String(row.volunteerPersonId) === String(personId)) return 'alreadyOwn'
  return 'conflict'
}

module.exports.classifyReleaseFailure = function ({ row }) {
  if (!row) return 'notFound'
  return 'conflict'
}

// Full village list for volunteer-facing filter UIs. Unlike VillageService's
// queryVillages, this is deliberately unfiltered by grants — the caller is
// a volunteer, not staff, and has none.
module.exports.getVolunteerRequestVillages = async function () {
  const [rows] = await dbUtils.pool.query(
    `SELECT CAST(id AS CHAR) AS villageId, name FROM village ORDER BY name ASC`
  )
  return rows
}

// open: pickable requests, any village — emergencyContact/volunteerAddress
// are never included here (matches the Open broadcast email, which has no
// owning volunteer to gate on yet). mine: the caller's upcoming (Confirmed)
// commitments. history: the caller's past (Completed) requests. Once a
// volunteer owns a request, emergencyContact/volunteerAddress are visible
// the same way in both mine and history — no further gating by status.
module.exports.getVolunteerRequests = async function ({ scope, personId }) {
  const columns = baseColumns()
  const joins = baseJoins()
  const predicates = { statements: [], binds: [] }

  if (scope === 'open') {
    predicates.statements.push("sr.status = 'Open'")
  } else {
    // Ownership expressed as an inline-escaped literal (not a `?` bind) so it
    // can sit inside the column list ahead of the WHERE predicates without
    // disturbing mysql.format's single linear bind-array ordering.
    const ownershipSql = `sr.volunteerPersonId = ${mysql.escape(personId)}`
    columns.push(emergencyContactColumn(ownershipSql))
    columns.push(volunteerAddressColumn(ownershipSql))
    const statusFilter = scope === 'mine' ? "sr.status = 'Confirmed'" : "sr.status = 'Completed'"
    predicates.statements.push('sr.volunteerPersonId = ?', statusFilter)
    predicates.binds.push(personId)
  }

  const orderBy = ['sr.startAt ASC']
  const sql = dbUtils.makeQueryString({ columns, joins, predicates, orderBy, format: true })
  const [rows] = await dbUtils.pool.query(sql)
  return rows
}

// Same visibility boundary as the list endpoint's open/mine/history scopes,
// combined: an Open request (any village) or one of the caller's own
// Confirmed/Completed requests. Used both for the deep-link single-item GET
// and for read-back after a successful sign-up/release, where the
// just-completed UPDATE has already put the row into one of these states.
module.exports.getVolunteerRequest = async function ({ serviceRequestId, personId }) {
  const columns = baseColumns()
  // personId is an integer from our own DB; escaped inline because
  // makeQueryString applies binds to predicates only (NAME_CLAIM_PATH pattern).
  // Ownership alone, any status — an Open row never matches (volunteerPersonId
  // is NULL), so this still returns null for Open, matching the email precedent.
  const ownershipSql = `sr.volunteerPersonId = ${mysql.escape(personId)}`
  columns.push(emergencyContactColumn(ownershipSql))
  columns.push(volunteerAddressColumn(ownershipSql))
  const joins = baseJoins()
  const predicates = {
    statements: [
      'sr.id = ?',
      `(sr.status = 'Open' OR (sr.volunteerPersonId = ? AND sr.status IN ('Confirmed', 'Completed')))`,
    ],
    binds: [serviceRequestId, personId],
  }
  const sql = dbUtils.makeQueryString({ columns, joins, predicates, format: true })
  const [rows] = await dbUtils.pool.query(sql)
  return rows[0] ?? null
}

module.exports.signUpVolunteerRequest = async function ({ serviceRequestId, personId, userId }) {
  return dbUtils.retryOnDeadlock2({
    transactionFn: async (connection) => {
      // Atomic first-wins: any unassigned Open request, any village.
      const [result] = await connection.query(
        `UPDATE service_request
         SET volunteerPersonId = ?, status = 'Confirmed', modifiedUserId = ?, modifiedAt = UTC_TIMESTAMP()
         WHERE id = ? AND status = 'Open' AND volunteerPersonId IS NULL`,
        [personId, userId, serviceRequestId]
      )
      if (result.affectedRows === 1) {
        await ServiceRequestService.writeNotificationEvent(connection, serviceRequestId, 'Confirmed')
        return { outcome: 'confirmed' }
      }
      const [rows] = await connection.query(
        'SELECT status, volunteerPersonId FROM service_request WHERE id = ?',
        [serviceRequestId]
      )
      return { outcome: module.exports.classifySignUpFailure({ row: rows[0], personId }) }
    },
  })
}

module.exports.releaseVolunteerRequest = async function ({ serviceRequestId, personId, userId }) {
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
        'SELECT status, volunteerPersonId FROM service_request WHERE id = ?',
        [serviceRequestId]
      )
      return { outcome: module.exports.classifyReleaseFailure({ row: rows[0] }) }
    },
  })
}
