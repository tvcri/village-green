'use strict';

const mysql = require('mysql2/promise')
const dbUtils = require('./utils')
const config = require('../utils/config')
const SmError = require('../utils/error')

const CANCELLED_STATUSES = ['Member cancelled', 'Volunteer cancelled', 'Hub cancelled']

// Escaped inline rather than bound: makeQueryString applies binds positionally
// across the whole query, and this path is static server config, not user input.
const NAME_CLAIM_PATH = mysql.escape(`$.${config.oauth.claims.name}`)

function deriveStatus(clientStatus, volunteerPersonId) {
  if (clientStatus === 'Draft' || clientStatus === 'Completed' || CANCELLED_STATUSES.includes(clientStatus)) {
    return clientStatus
  }
  return volunteerPersonId ? 'Confirmed' : 'Open'
}

async function writeNotificationEvent(connection, serviceRequestId, resolvedStatus) {
  if (resolvedStatus === 'Draft' || resolvedStatus === 'Completed') {
    throw new SmError.UnprocessableError()
  }
  let eventType
  if (CANCELLED_STATUSES.includes(resolvedStatus)) {
    eventType = 'cancelled'
  } else if (resolvedStatus === 'Confirmed') {
    eventType = 'confirmed'
  } else {
    eventType = 'open'
  }
  await connection.query(
    `INSERT INTO notification_event (eventType, serviceRequestId) VALUES (?, ?)`,
    [eventType, serviceRequestId]
  )
}

module.exports.getServiceRequest = async function (serviceRequestId, projections = []) {
  const columns = [
    'CAST(sr.id AS CHAR) AS serviceRequestId',
    'sr.requestNumber',
    'CAST(sr.villageId AS CHAR) AS villageId',
    'v.name AS villageName',
    'CAST(sr.memberPersonId AS CHAR) AS memberPersonId',
    'CAST(m.id AS CHAR) AS memberId',
    'mp.fullName AS memberFullName',
    'm.serviceNotes AS memberServiceNotes',
    'CAST(sr.volunteerPersonId AS CHAR) AS volunteerPersonId',
    'CAST(vol.id AS CHAR) AS volunteerId',
    'CAST(vv.id AS CHAR) AS volunteerVillageId',
    'vv.name AS volunteerVillageName',
    'vp.fullName AS volunteerFullName',
    'sr.status AS status',
    'sr.serviceName',
    'sr.transportationType',
    "DATE_FORMAT(sr.createdAt, '%Y-%m-%dT%TZ') AS createdAt",
    "DATE_FORMAT(sr.startAt, '%Y-%m-%dT%TZ') AS startAt",
    "DATE_FORMAT(sr.finishAt, '%Y-%m-%dT%TZ') AS finishAt",
    "DATE_FORMAT(sr.apptTime, '%Y-%m-%dT%TZ') AS apptTime",
    "DATE_FORMAT(sr.returnTime, '%Y-%m-%dT%TZ') AS returnTime",
    'sr.state AS state',
    'sr.instructions AS instructions',
    'sr.description AS description',
    'sr.destination AS destination',
    'sr.address AS address',
    'sr.city AS city',
    'sr.zip AS zip',
    'sr.phone AS phone',
    'CAST(sr.createdUserId AS CHAR) AS createdUserId',
    'ud.username AS createdByUsername',
    `COALESCE(json_unquote(json_extract(ud.lastClaims, ${NAME_CLAIM_PATH})), ud.username) AS createdByDisplayName`
  ]
  const joins = new Set([
    'service_request sr',
    'LEFT JOIN village v ON sr.villageId = v.id',
    'LEFT JOIN member m ON sr.memberPersonId = m.personId',
    'LEFT JOIN person mp ON sr.memberPersonId = mp.id',
    'LEFT JOIN volunteer vol ON sr.volunteerPersonId = vol.personId',
    'LEFT JOIN person vp ON sr.volunteerPersonId = vp.id',
    'LEFT JOIN village vv ON vp.villageId = vv.id',
    'LEFT JOIN user_data ud ON sr.createdUserId = ud.userId'
  ])
  const predicates = { statements: ['sr.id = ?'], binds: [serviceRequestId] }

  if (projections.includes('memberAddress')) {
    columns.push(`JSON_OBJECT(
      'address', mp.address,
      'city', mp.city,
      'state', mp.state,
      'zip', LPAD(mp.zip, 5, '0'),
      'phone', mp.phone,
      'cell', mp.cell,
      'email', mp.email
    ) AS memberAddress`)
  }

  if (projections.includes('volunteerAddress')) {
    columns.push(`IF(sr.volunteerPersonId IS NOT NULL, JSON_OBJECT(
      'address', vp.address,
      'city', vp.city,
      'state', vp.state,
      'zip', LPAD(vp.zip, 5, '0'),
      'phone', vp.phone,
      'cell', vp.cell,
      'email', vp.email
    ), NULL) AS volunteerAddress`)
  }

  if (projections.includes('notificationHistory')) {
    // MySQL JSON_ARRAYAGG does not support an ORDER BY clause (MariaDB does);
    // the array order is not significant, so none is applied.
    columns.push(`(
      SELECT JSON_ARRAYAGG(
        JSON_OBJECT(
          'id', ne.id,
          'eventType', ne.eventType,
          'createdAt', DATE_FORMAT(ne.createdAt, '%Y-%m-%dT%TZ'),
          'sentAt', DATE_FORMAT(ne.sentAt, '%Y-%m-%dT%TZ'),
          'failedAt', DATE_FORMAT(ne.failedAt, '%Y-%m-%dT%TZ'),
          'recipients', COALESCE((
            SELECT JSON_ARRAYAGG(JSON_OBJECT('id', p.id, 'fullName', p.fullName))
            FROM JSON_TABLE(ne.recipients, '$[*]' COLUMNS(personId INT PATH '$')) AS jt
            JOIN person p ON p.id = jt.personId
          ), JSON_ARRAY())
        )
      )
      FROM notification_event ne
      WHERE ne.serviceRequestId = sr.id
    ) AS notificationHistory`)
  }

  const sql = dbUtils.makeQueryString({ columns, joins, predicates, format: true })
  const [rows] = await dbUtils.pool.query(sql)
  return rows[0] ?? null
}

module.exports.getServiceRequests = async function ({ villageIdsGranted, elevate, status, villageId, hasNotifications }) {
  const columns = [
    'CAST(sr.id AS CHAR) AS serviceRequestId',
    'sr.requestNumber',
    'CAST(sr.villageId AS CHAR) AS villageId',
    'v.name AS villageName',
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
    "DATE_FORMAT(sr.finishAt, '%Y-%m-%dT%TZ') AS finishAt",
    "DATE_FORMAT(sr.apptTime, '%Y-%m-%dT%TZ') AS apptTime",
    "DATE_FORMAT(sr.returnTime, '%Y-%m-%dT%TZ') AS returnTime",
    'sr.state AS state',
    'sr.instructions AS instructions',
    'sr.description AS description',
    'sr.destination AS destination',
    'sr.address AS address',
    'sr.city AS city',
    'sr.zip AS zip',
    'sr.phone AS phone',
    'CAST(sr.createdUserId AS CHAR) AS createdUserId',
    'ud.username AS createdByUsername',
    `COALESCE(json_unquote(json_extract(ud.lastClaims, ${NAME_CLAIM_PATH})), ud.username) AS createdByDisplayName`,
    `COALESCE(
      (SELECT ${dbUtils.jsonArrayAggDistinct('JSON_QUOTE(ne.eventType)')}
       FROM notification_event ne
       WHERE ne.serviceRequestId = sr.id),
      JSON_ARRAY()
    ) AS notifications`
  ]
  const joins = new Set([
    'service_request sr',
    'JOIN village v ON sr.villageId = v.id',
    'LEFT JOIN member m ON sr.memberPersonId = m.personId',
    'LEFT JOIN person mp ON sr.memberPersonId = mp.id',
    'LEFT JOIN volunteer vol ON sr.volunteerPersonId = vol.personId',
    'LEFT JOIN person vp ON sr.volunteerPersonId = vp.id',
    'LEFT JOIN user_data ud ON sr.createdUserId = ud.userId'
  ])
  const predicates = { statements: [], binds: [] }

  if (!elevate) {
    if (!villageIdsGranted.length) return []
    predicates.statements.push('sr.villageId IN (?)')
    predicates.binds.push(villageIdsGranted)
  }
  if (villageId && villageId.length > 0) {
    predicates.statements.push('sr.villageId IN (?)')
    predicates.binds.push([villageId])
  }
  if (status && status.length > 0) {
    const dbStatuses = []
    for (const s of status) {
      if (s === 'open') dbStatuses.push('Open')
      else if (s === 'confirmed') dbStatuses.push('Confirmed')
      else if (s === 'draft') dbStatuses.push('Draft')
      else if (s === 'completed') dbStatuses.push('Completed')
      else if (s === 'unmatched') dbStatuses.push('Unmatched')
      else if (s === 'cancelled') {
        dbStatuses.push('Member cancelled', 'Volunteer cancelled', 'Hub cancelled')
      }
    }
    if (dbStatuses.length > 0) {
      predicates.statements.push('sr.status IN ?')
      predicates.binds.push([dbStatuses])
    }
  }
  if (hasNotifications === false) {
    predicates.statements.push(
      'NOT EXISTS (SELECT 1 FROM notification_event ne WHERE ne.serviceRequestId = sr.id) AND sr.requestNumber IS NULL'
    )
  }

  const orderBy = ['sr.finishAt DESC']
  const sql = dbUtils.makeQueryString({ columns, joins, predicates, orderBy, format: true })
  const [rows] = await dbUtils.pool.query(sql)
  return rows
}

module.exports.createServiceRequest = async function (payload, userId) {
  const convertToMySQLDateTime = (isoString) => {
    if (!isoString) return null
    const date = new Date(isoString)
    return date.toISOString().slice(0, 19).replace('T', ' ')
  }

  return dbUtils.retryOnDeadlock2({
    transactionFn: async (connection) => {
      const resolvedStatus = deriveStatus(payload.status, payload.volunteerPersonId)

      const insertFields = {
        villageId: payload.villageId,
        memberPersonId: payload.memberPersonId || null,
        volunteerPersonId: payload.volunteerPersonId || null,
        requestNumber: payload.requestNumber || null,
        status: resolvedStatus,
        serviceName: payload.serviceName || null,
        transportationType: payload.transportationType || null,
        startAt: convertToMySQLDateTime(payload.startAt),
        finishAt: convertToMySQLDateTime(payload.finishAt),
        apptTime: convertToMySQLDateTime(payload.apptTime),
        returnTime: convertToMySQLDateTime(payload.returnTime),
        state: payload.state || null,
        instructions: payload.instructions || null,
        description: payload.description || null,
        destination: payload.destination || null,
        address: payload.address || null,
        city: payload.city || null,
        zip: payload.zip || null,
        phone: payload.phone || null,
        createdUserId: userId
      }

      const [result] = await connection.query(
        'INSERT INTO service_request SET ?, createdAt = NOW()',
        insertFields
      )
      const serviceRequestId = result.insertId

      if (payload.notify) {
        await writeNotificationEvent(connection, serviceRequestId, resolvedStatus)
      }

      // Return only the id. Reading the record back here would run on a
      // separate pool connection while this transaction is still uncommitted,
      // so it would return null. The caller fetches after commit.
      return serviceRequestId
    }
  })
}

module.exports.patchServiceRequest = async function (serviceRequestId, payload) {
  const convertToMySQLDateTime = (isoString) => {
    if (!isoString) return null
    const date = new Date(isoString)
    return date.toISOString().slice(0, 19).replace('T', ' ')
  }

  return dbUtils.retryOnDeadlock2({
    transactionFn: async (connection) => {
      const [currentRows] = await connection.query(
        'SELECT volunteerPersonId, status FROM service_request WHERE id = ?',
        [serviceRequestId]
      )
      const current = currentRows[0]
      if (!current) return null

      const updateFields = {}
      if (payload.memberPersonId !== undefined) updateFields.memberPersonId = payload.memberPersonId || null
      if (payload.volunteerPersonId !== undefined) updateFields.volunteerPersonId = payload.volunteerPersonId || null
      if (payload.serviceName !== undefined) updateFields.serviceName = payload.serviceName || null
      if (payload.transportationType !== undefined) updateFields.transportationType = payload.transportationType || null
      if (payload.startAt !== undefined) updateFields.startAt = convertToMySQLDateTime(payload.startAt)
      if (payload.finishAt !== undefined) updateFields.finishAt = convertToMySQLDateTime(payload.finishAt)
      if (payload.apptTime !== undefined) updateFields.apptTime = convertToMySQLDateTime(payload.apptTime)
      if (payload.returnTime !== undefined) updateFields.returnTime = convertToMySQLDateTime(payload.returnTime)
      if (payload.state !== undefined) updateFields.state = payload.state || null
      if (payload.city !== undefined) updateFields.city = payload.city || null
      if (payload.zip !== undefined) updateFields.zip = payload.zip || null
      if (payload.address !== undefined) updateFields.address = payload.address || null
      if (payload.phone !== undefined) updateFields.phone = payload.phone || null
      if (payload.instructions !== undefined) updateFields.instructions = payload.instructions || null
      if (payload.description !== undefined) updateFields.description = payload.description || null
      if (payload.destination !== undefined) updateFields.destination = payload.destination || null

      const newVolunteerPersonId = payload.volunteerPersonId !== undefined
        ? (payload.volunteerPersonId || null)
        : current.volunteerPersonId
      const resolvedStatus = deriveStatus(payload.status, newVolunteerPersonId)
      updateFields.status = resolvedStatus

      await connection.query('UPDATE service_request SET ? WHERE id = ?', [updateFields, serviceRequestId])

      if (payload.notify) {
        await writeNotificationEvent(connection, serviceRequestId, resolvedStatus)
      }

      // Return only the id; the caller fetches the record after commit.
      return serviceRequestId
    }
  })
}

module.exports.deleteServiceRequest = async function (serviceRequestId) {
  const [result] = await dbUtils.pool.query(
    'DELETE FROM service_request WHERE id = ?',
    [serviceRequestId]
  )
  return result.affectedRows > 0
}

module.exports.writeNotificationEvent = writeNotificationEvent
