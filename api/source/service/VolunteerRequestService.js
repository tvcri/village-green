'use strict'

const mysql = require('mysql2/promise')
const dbUtils = require('./utils')
const ServiceRequestService = require('./ServiceRequestService')

// The fixed capability -> serviceName-prefix map. The serviceName vocabulary
// is a closed, developer-controlled set; a request is pickable under a
// capability iff its serviceName starts with that capability's prefix. The
// colon-terminated prefixes ('Ride:', 'Errand:') cover every subtype AND absorb
// the legacy whitespace-after-colon variants (Errand:Shopping / Errand: Shopping),
// since the match cut is at the colon. Capabilities with no service type
// (Friends, Steering Committee) derive to NULL and match nothing.
module.exports.buildCapabilityPrefixCase = function () {
  return `CASE c.name` +
    ` WHEN 'Rides'        THEN 'Ride:'` +
    ` WHEN 'Errands'      THEN 'Errand:'` +
    ` WHEN 'Home Help'    THEN 'Household Chores/Handy Help'` +
    ` WHEN 'Tech Support' THEN 'Tech Support'` +
    ` ELSE NULL END`
}

// Renders a person-id set for SQL IN (...). Escaped inline (not `?` binds) so
// callers can drop the result into column lists and CTEs without disturbing
// their bind arrays. An empty set becomes IN (NULL): matches nothing — never
// the syntax error IN (). (Unreachable behind the volunteer gate, which
// requires a non-empty set; belt-and-suspenders.) Ids are integers resolved
// from our own DB; the escape is defensive, not a user-input boundary.
function escapedIdList (personIds) {
  return mysql.escape(personIds?.length ? personIds : [null])
}

// The capability boundary as reusable, bind-free SQL pieces, shared by every
// volunteer-request read/write path (list, single GET, pickup). `cte` resolves
// the caller's ACTIVE-volunteer capabilities to serviceName prefixes; `join`
// restricts service_request `sr` to rows matching one of those prefixes. A
// request outside the caller's capabilities simply doesn't join — invisible on
// reads, un-pickable on writes.
//
// The set is escaped inline (not a `?` bind) so callers can drop these strings
// into makeQueryString or connection.query without disturbing their bind arrays
// — same rationale as the ownership literal in getVolunteerRequest. personIds
// are always integers resolved by the volunteer gate from our own DB; the
// escape is defensive belt-and-suspenders, not a user-input boundary. The
// CTE's SELECT DISTINCT unions capabilities across every matching volunteer
// row (any-of-set gate, across the caller's whole account).
module.exports.capabilityGateSql = function (personIds) {
  return {
    cte: `cteCapability AS (
      SELECT DISTINCT ${module.exports.buildCapabilityPrefixCase()} AS prefix
      FROM active_volunteer av
      JOIN volunteer_capability vc ON vc.volunteerId = av.id
      JOIN capability c ON c.id = vc.capabilityId
      WHERE av.personId IN (${escapedIdList(personIds)})
    )`,
    join: `JOIN cteCapability cc ON cc.prefix IS NOT NULL AND sr.serviceName LIKE concat(cc.prefix, '%')`,
  }
}

// The volunteer-facing read shape. The disclosure ceiling for the member
// block is what the open-broadcast emails already send (VSS design spec §3).
function baseColumns() {
  return [
    'CAST(sr.id AS CHAR) AS serviceRequestId',
    // requestNumber is the CE-legacy human number; NULL for VG-native requests.
    // Surfaced so the detail page can show `requestNumber ?? serviceRequestId`,
    // mirroring the staff ServiceRequestDetail.
    'sr.requestNumber',
    'CAST(sr.villageId AS CHAR) AS villageId',
    'v.name AS villageName',
    'sr.status AS status',
    'sr.serviceName',
    'sr.transportationType',
    "DATE_FORMAT(sr.createdAt, '%Y-%m-%dT%TZ') AS createdAt",
    // Wall-clock civil values (VG serviceDate/TIME split, migration 0014):
    // serviceDate is a 'YYYY-MM-DD' string, the four TIME columns are 'HH:MM:SS'
    // strings. Never instants — mysql2 returns TIME natively as strings, and
    // serviceDate is formatted here so it never hydrates into a JS Date.
    "DATE_FORMAT(sr.serviceDate, '%Y-%m-%d') AS serviceDate",
    'sr.startTime',
    'sr.finishTime',
    'sr.apptTime',
    'sr.returnTime',
    "CAST(IF(sr.timesFlexible, 'true', 'false') AS JSON) AS timesFlexible",
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
module.exports.classifySignUpFailure = function ({ row, personId, personIds }) {
  if (!row) return 'notFound'
  if (row.status === 'Confirmed') {
    const owner = String(row.volunteerPersonId)
    if (owner === String(personId)) return 'alreadyOwn'
    // Owned by ANOTHER volunteer on the same account (shared household
    // email): distinct outcome so the client can name who is committed.
    if ((personIds ?? []).map(String).includes(owner)) return 'alreadyOwnAccount'
  }
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
module.exports.getVolunteerRequests = async function ({ scope, personIds }) {
  const columns = baseColumns()
  const joins = baseJoins()
  const predicates = { statements: [], binds: [] }
  const ctes = []

  if (scope === 'open') {
    // Capability boundary: an Open request is visible only if its serviceName
    // matches a prefix for a capability ANY of the caller's volunteers holds
    // (union across the account — see capabilityGateSql).
    const gate = module.exports.capabilityGateSql(personIds)
    ctes.push(gate.cte)
    joins.add(gate.join)
    predicates.statements.push("sr.status = 'Open'")
  } else {
    // Ownership is account-wide: any of the caller's resolved persons.
    // Inline-escaped literal (not a `?` bind) so it can sit inside the column
    // list ahead of the WHERE predicates without disturbing mysql.format's
    // single linear bind-array ordering.
    const ownershipSql = `sr.volunteerPersonId IN (${escapedIdList(personIds)})`
    columns.push(emergencyContactColumn(ownershipSql))
    columns.push(volunteerAddressColumn(ownershipSql))
    // Which account volunteer owns each row — the client maps this to a name
    // via /user volunteers[] for the Volunteer column (multi-volunteer
    // accounts only).
    columns.push('CAST(sr.volunteerPersonId AS CHAR) AS volunteerPersonId')
    const statusFilter = scope === 'mine' ? "sr.status = 'Confirmed'" : "sr.status = 'Completed'"
    predicates.statements.push(`sr.volunteerPersonId IN (${escapedIdList(personIds)})`, statusFilter)
  }

  // Soonest-first: volunteers browse upcoming/open work by when it happens.
  // NULLs (undated requests) sort last. serviceDate + startTime are the
  // wall-clock civil columns (migration 0014); startAt/finishAt are gone.
  const orderBy = ['sr.serviceDate IS NULL ASC', 'sr.serviceDate ASC', 'sr.startTime ASC']
  const sql = dbUtils.makeQueryString({ ctes, columns, joins, predicates, orderBy, format: true })
  const [rows] = await dbUtils.pool.query(sql)
  return rows
}

// Same visibility boundary as the list endpoint's open/mine/history scopes,
// combined: an Open request (any village) or one of the caller's own
// Confirmed/Completed requests. Used both for the deep-link single-item GET
// and for read-back after a successful sign-up/release, where the
// just-completed UPDATE has already put the row into one of these states.
module.exports.getVolunteerRequest = async function ({ serviceRequestId, personIds }) {
  const columns = baseColumns()
  // Ownership is account-wide (any resolved person). Inline-escaped for the
  // same bind-ordering reason as the list endpoint. An Open row never matches
  // (volunteerPersonId is NULL), so this still returns null disclosure for
  // Open, matching the email precedent.
  const ownershipSql = `sr.volunteerPersonId IN (${escapedIdList(personIds)})`
  columns.push(emergencyContactColumn(ownershipSql))
  columns.push(volunteerAddressColumn(ownershipSql))
  columns.push('CAST(sr.volunteerPersonId AS CHAR) AS volunteerPersonId')
  const joins = baseJoins()
  // Capability gate applies ONLY to the Open leg: a volunteer may see an Open
  // request just when it matches their capabilities. The ownership leg is
  // unconditional — a request the caller already owns stays visible for
  // read-back even if their capability is later revoked. Expressed as EXISTS
  // (not a JOIN) so it scopes to the Open leg without filtering owned rows.
  const gate = module.exports.capabilityGateSql(personIds)
  const ctes = [gate.cte]
  const openMatchesCapability =
    `sr.status = 'Open' AND EXISTS (SELECT 1 FROM cteCapability cc WHERE cc.prefix IS NOT NULL AND sr.serviceName LIKE concat(cc.prefix, '%'))`
  const predicates = {
    statements: [
      'sr.id = ?',
      `((${openMatchesCapability}) OR (${ownershipSql} AND sr.status IN ('Confirmed', 'Completed')))`,
    ],
    binds: [serviceRequestId],
  }
  const sql = dbUtils.makeQueryString({ ctes, columns, joins, predicates, format: true })
  const [rows] = await dbUtils.pool.query(sql)
  return rows[0] ?? null
}

module.exports.signUpVolunteerRequest = async function ({ serviceRequestId, personId, personIds, userId }) {
  return dbUtils.retryOnDeadlock2({
    transactionFn: async (connection) => {
      // Which of the caller's persons hold a capability matching this request?
      // Replaces the old boolean pre-check: same boundary and same no-leak
      // outcome (a request outside every capability is 'notFound',
      // indistinguishable from missing), but also yields the auto-select
      // candidate set when no personId was posted. The capability part cannot
      // change mid-request, so no race is introduced.
      const prefixCase = module.exports.buildCapabilityPrefixCase()
      const [qualRows] = await connection.query(
        `SELECT DISTINCT av.personId
         FROM active_volunteer av
         JOIN volunteer_capability vc ON vc.volunteerId = av.id
         JOIN capability c ON c.id = vc.capabilityId
         JOIN service_request sr ON sr.id = ?
           AND (${prefixCase}) IS NOT NULL
           AND sr.serviceName LIKE concat((${prefixCase}), '%')
         WHERE av.personId IN (?)`,
        [serviceRequestId, personIds?.length ? personIds : [null]]
      )
      const qualifying = qualRows.map(r => String(r.personId))

      // Selection: a posted personId must individually qualify (the account
      // union is not enough — the chosen volunteer does the work). Omitted:
      // auto-select iff exactly one qualifies; 2+ need an explicit choice.
      let chosen = personId != null ? String(personId) : null
      if (chosen) {
        if (!qualifying.includes(chosen)) return { outcome: 'notFound' }
      }
      else if (qualifying.length === 0) return { outcome: 'notFound' }
      else if (qualifying.length > 1) return { outcome: 'selectionRequired' }
      else chosen = qualifying[0]

      // Atomic first-wins: any unassigned Open request, any village.
      const [result] = await connection.query(
        `UPDATE service_request
         SET volunteerPersonId = ?, status = 'Confirmed', modifiedUserId = ?, modifiedAt = UTC_TIMESTAMP()
         WHERE id = ? AND status = 'Open' AND volunteerPersonId IS NULL`,
        [chosen, userId, serviceRequestId]
      )
      if (result.affectedRows === 1) {
        await ServiceRequestService.writeNotificationEvent(connection, serviceRequestId, 'Confirmed')
        return { outcome: 'confirmed' }
      }
      const [rows] = await connection.query(
        'SELECT status, volunteerPersonId FROM service_request WHERE id = ?',
        [serviceRequestId]
      )
      const outcome = module.exports.classifySignUpFailure({ row: rows[0], personId: chosen, personIds })
      // owningPersonId only travels with alreadyOwnAccount — the one outcome
      // whose 409 detail names the committed volunteer; conflict must not
      // carry a stranger's id even though the controller doesn't serialize it.
      return outcome === 'alreadyOwnAccount'
        ? { outcome, owningPersonId: String(rows[0].volunteerPersonId) }
        : { outcome }
    },
  })
}

module.exports.releaseVolunteerRequest = async function ({ serviceRequestId, personIds, userId }) {
  return dbUtils.retryOnDeadlock2({
    transactionFn: async (connection) => {
      // Account-level release (spec, conscious decision): any of the caller's
      // volunteers' commitments can be released from the shared account.
      const [result] = await connection.query(
        `UPDATE service_request
         SET volunteerPersonId = NULL, status = 'Open', modifiedUserId = ?, modifiedAt = UTC_TIMESTAMP()
         WHERE id = ? AND status = 'Confirmed' AND volunteerPersonId IN (?)`,
        [userId, serviceRequestId, personIds?.length ? personIds : [null]]
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
