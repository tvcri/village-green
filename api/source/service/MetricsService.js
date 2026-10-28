'use strict';

const dbUtils = require('./utils')

// Cross-village metrics. Business rule matches getVillageMetrics: terminal
// statuses only (dbUtils.TERMINAL_SR_STATUSES) — 'Open'/'Confirmed' are still
// in flight and evt_auto_complete_service_requests rewrites them the day after
// serviceDate, so counting them makes a report irreproducible; 'Hub cancelled'
// is treated as if it never existed.
//
// Returns one cell per village x serviceName. Every other breakdown the client
// draws (by village, by service type, by category) is a reduction of these
// cells, so the payload is sent once and never refetched on a chart switch.
const statusJson = (alias, and = '') => `JSON_OBJECT(
  'completed',          COALESCE(SUM(${alias}.status = 'Completed'${and}), 0),
  'unmatched',          COALESCE(SUM(${alias}.status = 'Unmatched'${and}), 0),
  'memberCancelled',    COALESCE(SUM(${alias}.status = 'Member cancelled'${and}), 0),
  'volunteerCancelled', COALESCE(SUM(${alias}.status = 'Volunteer cancelled'${and}), 0)
)`

module.exports.getMetaMetrics = async function ({ villageIds, start, end }) {
  const ridePrefix = dbUtils.SERVICE_CATEGORIES.find(c => c.category === 'Rides').match.prefix
  // "2 legs" basis, identical to getVillageMetrics: round-trip RIDES only,
  // counted per status so every outcome doubles. Non-ride round trips exist
  // in live data and are never doubled.
  const roundTripJson = statusJson('sr',
    ` AND sr.transportationType = 'Round Trip' AND sr.serviceName LIKE '${ridePrefix}%'`)
  const categoryCase = dbUtils.buildServiceNameCategoryCase('sr.serviceName')

  // villageIds === null means a federation read: no village restriction.
  const scopeSql = villageIds === null ? '' : 'WHERE v.id IN (?)'
  const scopeBinds = villageIds === null ? [] : [villageIds]

  const [villages] = await dbUtils.pool.query(
    `SELECT CAST(v.id AS CHAR) AS villageId, v.name AS villageName
     FROM village v ${scopeSql} ORDER BY v.name`,
    scopeBinds
  )

  if (villages.length === 0) return { range: { start, end }, villages: [], cells: [] }

  const [cells] = await dbUtils.pool.query(
    `SELECT
       CAST(sr.villageId AS CHAR) AS villageId,
       sr.serviceName,
       ${categoryCase} AS category,
       ${statusJson('sr')} AS byStatus,
       ${roundTripJson} AS roundTrips
     FROM service_request sr
     WHERE sr.villageId IN (?)
       AND ${dbUtils.sqlTerminalStatus('sr.status')}
       AND sr.serviceName IS NOT NULL
       AND sr.serviceDate BETWEEN ? AND ?
     GROUP BY sr.villageId, sr.serviceName
     ORDER BY sr.villageId, sr.serviceName`,
    [villages.map(v => v.villageId), start, end]
  )

  return { range: { start, end }, villages, cells }
}

// Per-person Completed-request counts: the active roster (so idle people show
// as 0) plus anyone inactive who had Completed activity in range. Same counting
// as getVillageMetrics' byMember/byVolunteer, but a person's count spans every
// village in the caller's scope rather than one village.
//
// villageIds: the caller's village scope (null = federation, unrestricted);
// it bounds which requests count. personVillageIds: which persons are listed,
// by person.villageId (null = every person).
module.exports.getMetaMetricsPersons = async function ({ villageIds, personVillageIds, start, end }) {
  const ridePrefix = dbUtils.SERVICE_CATEGORIES.find(c => c.category === 'Rides').match.prefix
  const srScopeSql = villageIds === null ? '' : 'AND sr.villageId IN (?)'
  const personScopeSql = personVillageIds === null ? '' : 'AND p.villageId IN (?)'

  const roster = (table, personCol, activeSql, statusCol) => {
    const sql = `
      SELECT
        CAST(p.id AS CHAR) AS personId,
        p.fullName,
        CAST(p.villageId AS CHAR) AS villageId,
        ${statusCol},
        p.deceased AS deceased,
        COALESCE(t.cnt, 0) AS count,
        COALESCE(t.rt, 0) AS completedRoundTrips
      FROM ${table} r
      JOIN person p ON p.id = r.personId
      LEFT JOIN (
        SELECT sr.${personCol} AS pid,
          COUNT(*) AS cnt,
          SUM(sr.transportationType = 'Round Trip' AND sr.serviceName LIKE '${ridePrefix}%') AS rt
        FROM service_request sr
        WHERE sr.status = 'Completed'
          AND sr.${personCol} IS NOT NULL
          AND sr.serviceDate BETWEEN ? AND ?
          ${srScopeSql}
        GROUP BY sr.${personCol}) t ON t.pid = p.id
      WHERE ((${activeSql} AND NOT p.deceased) OR t.cnt > 0)
        ${personScopeSql}
      ORDER BY p.fullName`
    const binds = [start, end]
    if (villageIds !== null) binds.push(villageIds)
    if (personVillageIds !== null) binds.push(personVillageIds)
    return dbUtils.pool.query(sql, binds).then(([rows]) => rows)
  }

  const [members, volunteers] = await Promise.all([
    roster('member', 'memberPersonId', `r.status = 'Active'`, 'r.status'),
    roster('volunteer', 'volunteerPersonId', `r.status = 'Active'`, 'r.status')
  ])
  return {
    range: { start, end },
    members: members.map(m => ({ ...m, deceased: m.deceased === true })),
    volunteers: volunteers.map(v => ({ ...v, deceased: v.deceased === true }))
  }
}
