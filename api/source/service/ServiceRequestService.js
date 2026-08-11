'use strict';

const mysql = require('mysql2/promise')
const dbUtils = require('./utils')
const config = require('../utils/config')
const SmError = require('../utils/error')

const CANCELLED_STATUSES = ['Member cancelled', 'Volunteer cancelled', 'Hub cancelled']

// The five end states. A request in any of these never returns to Open or
// Confirmed — customer-agreed policy, enforced in patchServiceRequest.
const END_STATES = [...CANCELLED_STATUSES, 'Completed', 'Unmatched']

// notification_event.eventType covers open/confirmed/cancelled (plus
// reminder, which isn't status-driven). Completed and Unmatched have no
// corresponding event, so a status resolving to either cannot be notified —
// enforced in writeNotificationEvent, the sole place that maps a status to
// an event.
const NON_NOTIFIABLE_STATUSES = ['Completed', 'Unmatched']

function isEndState(status) {
  return END_STATES.includes(status)
}

// Escaped inline rather than bound: makeQueryString applies binds positionally
// across the whole query, and this path is static server config, not user input.
const NAME_CLAIM_PATH = mysql.escape(`$.${config.oauth.claims.name}`)

function deriveStatus(clientStatus, volunteerPersonId) {
  if (clientStatus === 'Completed' || CANCELLED_STATUSES.includes(clientStatus)) {
    return clientStatus
  }
  return volunteerPersonId ? 'Confirmed' : 'Open'
}

async function writeNotificationEvent(connection, serviceRequestId, resolvedStatus) {
  if (NON_NOTIFIABLE_STATUSES.includes(resolvedStatus)) {
    throw new SmError.UnprocessableError(
      `A ${resolvedStatus} service request has no notification to send.`
    )
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
    // serviceDate as a string: mysql2 would otherwise hydrate DATE into a
    // JS Date at server-local midnight, reintroducing tz ambiguity.
    "DATE_FORMAT(sr.serviceDate, '%Y-%m-%d') AS serviceDate",
    // TIME columns come back from mysql2 as 'HH:MM:SS' strings natively.
    'sr.startTime',
    'sr.finishTime',
    'sr.apptTime',
    'sr.returnTime',
    // JSON boolean (0/1 tinyint would fail the OAS boolean type).
    "CAST(IF(sr.timesFlexible, 'true', 'false') AS JSON) AS timesFlexible",
    'sr.state AS state',
    'sr.instructions AS instructions',
    'sr.description AS description',
    'sr.`start` AS `start`',
    'sr.destination AS destination',
    'sr.address AS address',
    'sr.city AS city',
    'sr.zip AS zip',
    'sr.phone AS phone',
    'sr.startAddress AS startAddress',
    'sr.startCity AS startCity',
    'sr.startState AS startState',
    'sr.startZip AS startZip',
    'sr.startPhone AS startPhone',
    'CAST(sr.createdUserId AS CHAR) AS createdUserId',
    'ud.username AS createdByUsername',
    `COALESCE(json_unquote(json_extract(ud.lastClaims, ${NAME_CLAIM_PATH})), ud.username) AS createdByDisplayName`,
    "DATE_FORMAT(sr.modifiedAt, '%Y-%m-%dT%TZ') AS modifiedAt",
    'CAST(sr.modifiedUserId AS CHAR) AS modifiedUserId',
    'udm.username AS modifiedByUsername',
    `COALESCE(json_unquote(json_extract(udm.lastClaims, ${NAME_CLAIM_PATH})), udm.username) AS modifiedByDisplayName`
  ]
  const joins = new Set([
    'service_request sr',
    'LEFT JOIN village v ON sr.villageId = v.id',
    'LEFT JOIN member m ON sr.memberPersonId = m.personId',
    'LEFT JOIN person mp ON sr.memberPersonId = mp.id',
    'LEFT JOIN volunteer vol ON sr.volunteerPersonId = vol.personId',
    'LEFT JOIN person vp ON sr.volunteerPersonId = vp.id',
    'LEFT JOIN village vv ON vp.villageId = vv.id',
    'LEFT JOIN user_data ud ON sr.createdUserId = ud.userId',
    'LEFT JOIN user_data udm ON sr.modifiedUserId = udm.userId'
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

module.exports.getServiceRequests = async function ({ villageIdsGranted, status, villageId, hasNotifications, serviceDateStart, serviceDateEnd, excludeHubCancelled = false }) {
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
    // serviceDate as a string: mysql2 would otherwise hydrate DATE into a
    // JS Date at server-local midnight, reintroducing tz ambiguity.
    "DATE_FORMAT(sr.serviceDate, '%Y-%m-%d') AS serviceDate",
    // TIME columns come back from mysql2 as 'HH:MM:SS' strings natively.
    'sr.startTime',
    'sr.finishTime',
    'sr.apptTime',
    'sr.returnTime',
    // JSON boolean (0/1 tinyint would fail the OAS boolean type).
    "CAST(IF(sr.timesFlexible, 'true', 'false') AS JSON) AS timesFlexible",
    'sr.state AS state',
    'sr.instructions AS instructions',
    'sr.description AS description',
    'sr.`start` AS `start`',
    'sr.destination AS destination',
    'sr.address AS address',
    'sr.city AS city',
    'sr.zip AS zip',
    'sr.phone AS phone',
    'sr.startAddress AS startAddress',
    'sr.startCity AS startCity',
    'sr.startState AS startState',
    'sr.startZip AS startZip',
    'sr.startPhone AS startPhone',
    'CAST(sr.createdUserId AS CHAR) AS createdUserId',
    'ud.username AS createdByUsername',
    `COALESCE(json_unquote(json_extract(ud.lastClaims, ${NAME_CLAIM_PATH})), ud.username) AS createdByDisplayName`,
    // TECH DEBT: proxy for "accepted via VSS" — modifiedUserId is written
    // only by the VSS signup/release paths today. When VSS records signup
    // explicitly (board item "Record VSS signup explicitly instead of
    // modifiedUserId proxy"), change only this derivation.
    "CAST(IF(sr.modifiedUserId IS NOT NULL, 'true', 'false') AS JSON) AS vssSignup",
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

  if (villageIdsGranted !== null) {
    // Non-federation caller: restrict to the villages they were granted
    // sr:read in. villageIdsGranted === null means a federation-wide read,
    // which is unrestricted here.
    if (!villageIdsGranted.length) return []
    predicates.statements.push('sr.villageId IN (?)')
    predicates.binds.push(villageIdsGranted)
  }
  if (villageId && villageId.length > 0) {
    predicates.statements.push('sr.villageId IN (?)')
    predicates.binds.push(villageId)
  }
  if (status && status.length > 0) {
    const dbStatuses = []
    for (const s of status) {
      if (s === 'open') dbStatuses.push('Open')
      else if (s === 'confirmed') dbStatuses.push('Confirmed')
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
  if (excludeHubCancelled) {
    // Village-scoped callers share the metrics business rule: 'Hub cancelled'
    // requests are treated as if they never existed. The meta list keeps them.
    predicates.statements.push("sr.status <> 'Hub cancelled'")
  }
  if (hasNotifications === false) {
    predicates.statements.push(
      'NOT EXISTS (SELECT 1 FROM notification_event ne WHERE ne.serviceRequestId = sr.id) AND sr.requestNumber IS NULL'
    )
  }

  // serviceDate is a DATE column holding a wall-clock civil date; both bounds
  // are inclusive and compared as plain 'YYYY-MM-DD' strings. serviceDateEnd
  // omitted means no upper bound — future-dated requests still match.
  if (serviceDateStart) {
    predicates.statements.push('sr.serviceDate >= ?')
    predicates.binds.push(serviceDateStart)
  }
  if (serviceDateEnd) {
    predicates.statements.push('sr.serviceDate <= ?')
    predicates.binds.push(serviceDateEnd)
  }

  const orderBy = ['sr.serviceDate DESC', 'sr.startTime DESC']
  const sql = dbUtils.makeQueryString({ columns, joins, predicates, orderBy, format: true })
  const [rows] = await dbUtils.pool.query(sql)
  return rows
}

module.exports.createServiceRequest = async function (payload, userId) {
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
        serviceDate: payload.serviceDate || null,
        timesFlexible: payload.timesFlexible ? 1 : 0,
        startTime: payload.startTime || null,
        finishTime: payload.finishTime || null,
        apptTime: payload.apptTime || null,
        returnTime: payload.returnTime || null,
        state: payload.state || null,
        instructions: payload.instructions || null,
        description: payload.description || null,
        start: payload.start || null,
        destination: payload.destination || null,
        address: payload.address || null,
        city: payload.city || null,
        zip: payload.zip || null,
        phone: payload.phone || null,
        startAddress: payload.startAddress || null,
        startCity: payload.startCity || null,
        startState: payload.startState || null,
        startZip: payload.startZip || null,
        startPhone: payload.startPhone || null,
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
  return dbUtils.retryOnDeadlock2({
    transactionFn: async (connection) => {
      const [currentRows] = await connection.query(
        'SELECT volunteerPersonId, status FROM service_request WHERE id = ?',
        [serviceRequestId]
      )
      const current = currentRows[0]
      if (!current) return null

      // Rule 2: never backward. The Patch enum already excludes Open and
      // Confirmed, so a caller cannot request this directly today — it is
      // stated here so the invariant does not silently depend on the enum's
      // vocabulary, and it stays live alongside rules 1 and 3 below, which
      // guard the same terminal-row neighborhood. Only `undefined` is exempt:
      // absence means "leave it alone", but an explicit null would fall
      // through to deriveStatus(null, ...) and re-derive Open/Confirmed, which
      // is exactly the backward move this rule exists to refuse.
      if (isEndState(current.status) && payload.status !== undefined &&
          !isEndState(payload.status)) {
        throw new SmError.UnprocessableError(
          `Cannot change status from ${current.status} to ${payload.status}: a request never moves backward in its lifecycle.`
        )
      }

      const updateFields = {}
      if (payload.memberPersonId !== undefined) updateFields.memberPersonId = payload.memberPersonId || null
      if (payload.volunteerPersonId !== undefined) updateFields.volunteerPersonId = payload.volunteerPersonId || null
      if (payload.serviceName !== undefined) updateFields.serviceName = payload.serviceName || null
      if (payload.transportationType !== undefined) updateFields.transportationType = payload.transportationType || null
      if (payload.serviceDate !== undefined) updateFields.serviceDate = payload.serviceDate
      if (payload.timesFlexible !== undefined) updateFields.timesFlexible = payload.timesFlexible ? 1 : 0
      if (payload.startTime !== undefined) updateFields.startTime = payload.startTime
      if (payload.finishTime !== undefined) updateFields.finishTime = payload.finishTime
      if (payload.apptTime !== undefined) updateFields.apptTime = payload.apptTime
      if (payload.returnTime !== undefined) updateFields.returnTime = payload.returnTime
      if (payload.state !== undefined) updateFields.state = payload.state || null
      if (payload.city !== undefined) updateFields.city = payload.city || null
      if (payload.zip !== undefined) updateFields.zip = payload.zip || null
      if (payload.address !== undefined) updateFields.address = payload.address || null
      if (payload.phone !== undefined) updateFields.phone = payload.phone || null
      if (payload.startAddress !== undefined) updateFields.startAddress = payload.startAddress || null
      if (payload.startCity !== undefined) updateFields.startCity = payload.startCity || null
      if (payload.startState !== undefined) updateFields.startState = payload.startState || null
      if (payload.startZip !== undefined) updateFields.startZip = payload.startZip || null
      if (payload.startPhone !== undefined) updateFields.startPhone = payload.startPhone || null
      if (payload.instructions !== undefined) updateFields.instructions = payload.instructions || null
      if (payload.description !== undefined) updateFields.description = payload.description || null
      if (payload.start !== undefined) updateFields.start = payload.start || null
      if (payload.destination !== undefined) updateFields.destination = payload.destination || null

      const newVolunteerPersonId = payload.volunteerPersonId !== undefined
        ? (payload.volunteerPersonId || null)
        : current.volunteerPersonId

      // Rule 1: on a cancelled or Unmatched row, CHANGING the volunteer is
      // only meaningful as a step toward Confirmed — the backward move. Judge
      // a change of value, not the presence of the key: the Vue form always
      // sends volunteerPersonId, so keying on presence would refuse every
      // ordinary save on a cancelled request. Completed is the one exempt
      // destination: recording who performed the service is the whole point of
      // that write, and rule 3 below in fact requires a volunteer for it. Any
      // OTHER end state is not exempt — re-cancelling under a different reason
      // is no license to reassign the volunteer.
      const volunteerChanged = String(newVolunteerPersonId ?? '') !== String(current.volunteerPersonId ?? '')
      const ruleOneApplies = isEndState(current.status) && current.status !== 'Completed'
      if (ruleOneApplies && volunteerChanged && payload.status !== 'Completed') {
        throw new SmError.UnprocessableError(
          `Cannot change the volunteer on a request with status ${current.status}.`
        )
      }

      // Absence must never imply an operation on a terminal row: omitting
      // status means "leave it alone", not "recompute". Non-terminal rows are
      // untouched — they still derive from volunteer presence exactly as
      // before, which is what keeps { volunteerPersonId } on an Open row
      // working. Only `undefined` short-circuits here; an explicit null still
      // means recompute — which on a terminal row rule 2 above has already
      // refused, so this ternary only ever sees null on a non-terminal row.
      const resolvedStatus = payload.status === undefined && isEndState(current.status)
        ? current.status
        : deriveStatus(payload.status, newVolunteerPersonId)
      updateFields.status = resolvedStatus

      // Rule 3: a Completed request must credit a volunteer. deriveStatus
      // passes an explicit Completed through untouched, so without this a
      // caller can record a completed service nobody performed.
      if (resolvedStatus === 'Completed' && !newVolunteerPersonId) {
        throw new SmError.UnprocessableError(
          'A Completed service request must have a volunteer.'
        )
      }

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
