'use strict';

const dbUtils = require('./utils')
const SmError = require('../utils/error')

const CANCELLED_STATUSES = ['Member cancelled', 'Volunteer cancelled', 'Hub cancelled']

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
    `INSERT INTO notification_event (event_type, service_request_id) VALUES (?, ?)`,
    [eventType, serviceRequestId]
  )
}

module.exports.getServiceRequest = async function (serviceRequestId, projections = []) {
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
    "DATE_FORMAT(sr.appt_time, '%Y-%m-%dT%TZ') AS apptTime",
    "DATE_FORMAT(sr.return_time, '%Y-%m-%dT%TZ') AS returnTime",
    'sr.state AS state',
    'sr.instructions AS instructions',
    'sr.description AS description',
    'sr.destination AS destination',
    'sr.address AS address',
    'sr.city AS city',
    'sr.zip AS zip',
    'sr.phone AS phone'
  ]
  const joins = new Set([
    'service_request sr',
    'LEFT JOIN member m ON sr.member_person_id = m.person_id',
    'LEFT JOIN person mp ON sr.member_person_id = mp.id',
    'LEFT JOIN volunteer vol ON sr.volunteer_person_id = vol.person_id',
    'LEFT JOIN person vp ON sr.volunteer_person_id = vp.id'
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
    columns.push(`IF(sr.volunteer_person_id IS NOT NULL, JSON_OBJECT(
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
          'eventType', ne.event_type,
          'createdAt', DATE_FORMAT(ne.created_at, '%Y-%m-%dT%TZ'),
          'sentAt', DATE_FORMAT(ne.sent_at, '%Y-%m-%dT%TZ'),
          'failedAt', DATE_FORMAT(ne.failed_at, '%Y-%m-%dT%TZ'),
          'recipients', COALESCE((
            SELECT JSON_ARRAYAGG(JSON_OBJECT('id', p.id, 'fullName', p.full_name))
            FROM JSON_TABLE(ne.recipients, '$[*]' COLUMNS(personId INT PATH '$')) AS jt
            JOIN person p ON p.id = jt.personId
          ), JSON_ARRAY())
        )
      )
      FROM notification_event ne
      WHERE ne.service_request_id = sr.id
    ) AS notificationHistory`)
  }

  const sql = dbUtils.makeQueryString({ columns, joins, predicates, format: true })
  const [rows] = await dbUtils.pool.query(sql)
  return rows[0] ?? null
}

module.exports.getServiceRequests = async function ({ villageIdsGranted, elevate, status, villageId, hasNotifications }) {
  const columns = [
    'CAST(sr.id AS CHAR) AS serviceRequestId',
    'sr.request_number AS requestNumber',
    'CAST(sr.village_id AS CHAR) AS villageId',
    'v.name AS villageName',
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
    "DATE_FORMAT(sr.appt_time, '%Y-%m-%dT%TZ') AS apptTime",
    "DATE_FORMAT(sr.return_time, '%Y-%m-%dT%TZ') AS returnTime",
    'sr.state AS state',
    'sr.instructions AS instructions',
    'sr.description AS description',
    'sr.destination AS destination',
    'sr.address AS address',
    'sr.city AS city',
    'sr.zip AS zip',
    'sr.phone AS phone',
    `COALESCE(
      (SELECT JSON_ARRAYAGG(t.event_type)
       FROM (SELECT DISTINCT ne.event_type FROM notification_event ne WHERE ne.service_request_id = sr.id) t),
      JSON_ARRAY()
    ) AS notifications`
  ]
  const joins = new Set([
    'service_request sr',
    'JOIN village v ON sr.village_id = v.id',
    'LEFT JOIN member m ON sr.member_person_id = m.person_id',
    'LEFT JOIN person mp ON sr.member_person_id = mp.id',
    'LEFT JOIN volunteer vol ON sr.volunteer_person_id = vol.person_id',
    'LEFT JOIN person vp ON sr.volunteer_person_id = vp.id'
  ])
  const predicates = { statements: [], binds: [] }

  if (!elevate) {
    if (!villageIdsGranted.length) return []
    predicates.statements.push('sr.village_id IN (?)')
    predicates.binds.push(villageIdsGranted)
  }
  if (villageId && villageId.length > 0) {
    predicates.statements.push('sr.village_id IN (?)')
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
      'NOT EXISTS (SELECT 1 FROM notification_event ne WHERE ne.service_request_id = sr.id)'
    )
  }

  const orderBy = ['sr.finish_at DESC']
  const sql = dbUtils.makeQueryString({ columns, joins, predicates, orderBy, format: true })
  const [rows] = await dbUtils.pool.query(sql)
  return rows
}

module.exports.createServiceRequest = async function (payload) {
  const convertToMySQLDateTime = (isoString) => {
    if (!isoString) return null
    const date = new Date(isoString)
    return date.toISOString().slice(0, 19).replace('T', ' ')
  }

  return dbUtils.retryOnDeadlock2({
    transactionFn: async (connection) => {
      const resolvedStatus = deriveStatus(payload.status, payload.volunteerPersonId)

      const sql = `
        INSERT INTO service_request (
          village_id,
          member_person_id,
          volunteer_person_id,
          request_number,
          status,
          service_name,
          transportation_type,
          created_at,
          start_at,
          finish_at,
          appt_time,
          return_time,
          state,
          instructions,
          description,
          destination,
          address,
          city,
          zip,
          phone
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      const values = [
        payload.villageId,
        payload.memberPersonId || null,
        payload.volunteerPersonId || null,
        payload.requestNumber || null,
        resolvedStatus,
        payload.serviceName || null,
        payload.transportationType || null,
        convertToMySQLDateTime(payload.startAt),
        convertToMySQLDateTime(payload.finishAt),
        convertToMySQLDateTime(payload.apptTime),
        convertToMySQLDateTime(payload.returnTime),
        payload.state || null,
        payload.instructions || null,
        payload.description || null,
        payload.destination || null,
        payload.address || null,
        payload.city || null,
        payload.zip || null,
        payload.phone || null
      ]
      const [result] = await connection.query(sql, values)
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
        'SELECT volunteer_person_id, status FROM service_request WHERE id = ?',
        [serviceRequestId]
      )
      const current = currentRows[0]
      if (!current) return serviceRequestId

      const updates = []
      const values = []

      if (payload.memberPersonId !== undefined) {
        updates.push('member_person_id = ?')
        values.push(payload.memberPersonId || null)
      }
      if (payload.volunteerPersonId !== undefined) {
        updates.push('volunteer_person_id = ?')
        values.push(payload.volunteerPersonId || null)
      }
      if (payload.serviceName !== undefined) {
        updates.push('service_name = ?')
        values.push(payload.serviceName || null)
      }
      if (payload.transportationType !== undefined) {
        updates.push('transportation_type = ?')
        values.push(payload.transportationType || null)
      }
      if (payload.startAt !== undefined) {
        updates.push('start_at = ?')
        values.push(convertToMySQLDateTime(payload.startAt))
      }
      if (payload.finishAt !== undefined) {
        updates.push('finish_at = ?')
        values.push(convertToMySQLDateTime(payload.finishAt))
      }
      if (payload.apptTime !== undefined) {
        updates.push('appt_time = ?')
        values.push(convertToMySQLDateTime(payload.apptTime))
      }
      if (payload.returnTime !== undefined) {
        updates.push('return_time = ?')
        values.push(convertToMySQLDateTime(payload.returnTime))
      }
      if (payload.state !== undefined) {
        updates.push('state = ?')
        values.push(payload.state || null)
      }
      if (payload.city !== undefined) {
        updates.push('city = ?')
        values.push(payload.city || null)
      }
      if (payload.zip !== undefined) {
        updates.push('zip = ?')
        values.push(payload.zip || null)
      }
      if (payload.address !== undefined) {
        updates.push('address = ?')
        values.push(payload.address || null)
      }
      if (payload.phone !== undefined) {
        updates.push('phone = ?')
        values.push(payload.phone || null)
      }
      if (payload.instructions !== undefined) {
        updates.push('instructions = ?')
        values.push(payload.instructions || null)
      }
      if (payload.description !== undefined) {
        updates.push('description = ?')
        values.push(payload.description || null)
      }
      if (payload.destination !== undefined) {
        updates.push('destination = ?')
        values.push(payload.destination || null)
      }

      const newVolunteerPersonId = payload.volunteerPersonId !== undefined
        ? (payload.volunteerPersonId || null)
        : current.volunteer_person_id
      const resolvedStatus = deriveStatus(payload.status, newVolunteerPersonId)

      updates.push('status = ?')
      values.push(resolvedStatus)

      values.push(serviceRequestId)
      const sql = `UPDATE service_request SET ${updates.join(', ')} WHERE id = ?`
      await connection.query(sql, values)

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
