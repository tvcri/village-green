'use strict';

const dbUtils = require('./utils')

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


  const sql = dbUtils.makeQueryString({ columns, joins, predicates, format: true })
  const [rows] = await dbUtils.pool.query(sql)
  return rows[0] ?? null
}

module.exports.getServiceRequests = async function ({ villageIdsGranted, elevate, status, villageId }) {
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
    'sr.phone AS phone'
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
        payload.status || null,
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

      // Create email event for new request
      const emailEventSql = `
        INSERT INTO email_event (event_type, service_request_id, volunteer_id)
        VALUES ('new_request', ?, ?)
      `
      await connection.query(emailEventSql, [serviceRequestId, payload.volunteerPersonId || null])

      return module.exports.getServiceRequest(serviceRequestId)
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
      if (payload.status !== undefined) {
        updates.push('status = ?')
        values.push(payload.status || null)
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

      if (updates.length === 0) {
        return module.exports.getServiceRequest(serviceRequestId)
      }

      values.push(serviceRequestId)
      const sql = `UPDATE service_request SET ${updates.join(', ')} WHERE id = ?`
      await connection.query(sql, values)

      // Create email event for patched request
      const emailEventSql = `
        INSERT INTO email_event (event_type, service_request_id, volunteer_id)
        VALUES ('patch_request', ?, ?)
      `
      await connection.query(emailEventSql, [serviceRequestId, payload.volunteerPersonId || null])

      return module.exports.getServiceRequest(serviceRequestId)
    }
  })
}
