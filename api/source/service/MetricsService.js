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
const statusJson = (alias) => `JSON_OBJECT(
  'completed',          COALESCE(SUM(${alias}.status = 'Completed'), 0),
  'unmatched',          COALESCE(SUM(${alias}.status = 'Unmatched'), 0),
  'memberCancelled',    COALESCE(SUM(${alias}.status = 'Member cancelled'), 0),
  'volunteerCancelled', COALESCE(SUM(${alias}.status = 'Volunteer cancelled'), 0)
)`

module.exports.getMetaMetrics = async function ({ villageIds, start, end }) {
  const ridePrefix = dbUtils.SERVICE_CATEGORIES.find(c => c.category === 'Rides').match.prefix
  // Legacy "2 legs" basis, identical to getVillageMetrics: completed
  // round-trip RIDES only. The legacy counter never doubled non-ride round
  // trips, which do exist in live data.
  const roundTripSum = `COALESCE(SUM(sr.status = 'Completed'
    AND sr.transportationType = 'Round Trip'
    AND sr.serviceName LIKE '${ridePrefix}%'), 0)`
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
       ${roundTripSum} AS completedRoundTrips
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
