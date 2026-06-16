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
    'sr.instructions AS instructions',
    'sr.description AS description',
    'sr.destination AS destination',
    'sr.address AS address',
    'sr.city AS city',
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
    predicates.statements.push('sr.village_id IN (?)')
    predicates.binds.push([villageIdsGranted])
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
