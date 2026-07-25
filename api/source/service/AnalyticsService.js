'use strict'

const dbUtils = require('./utils')

module.exports.postEvents = async function (userId, events) {
  if (!events.length) return
  const values = events.map(e => [
    userId,
    e.eventType,
    e.routeName ?? null,
    e.path ?? null,
    e.eventName ?? null,
    e.metadata ? JSON.stringify(e.metadata) : null,
    e.deviceClass ?? null,
  ])
  await dbUtils.pool.query(
    `INSERT INTO analytics_events (userId, eventType, routeName, path, eventName, metadata, deviceClass)
     VALUES ?`,
    [values]
  )
}

module.exports.getSummary = async function ({ from, to, userId } = {}) {
  const predicates = [`eventType = 'page_view'`]
  const params = []

  if (from) {
    predicates.push(`createdAt >= ?`)
    params.push(from)
  }
  if (to) {
    predicates.push(`createdAt <= ?`)
    params.push(to)
  }
  if (userId) {
    predicates.push(`userId = ?`)
    params.push(userId)
  }

  const where = predicates.length ? `WHERE ${predicates.join(' AND ')}` : ''

  // Device counts are pre-pivoted into fixed columns rather than aggregated
  // into JSON: the class set is closed, and an explicit response schema means
  // a new bucket cannot reach clients without the spec acknowledging it.
  //
  // NULL deviceClass (rows written before device tracking existed) folds into
  // unknownVisits so the four columns always sum to totalVisits.
  //
  // CAST because SUM() over a comparison yields DECIMAL, which the driver
  // returns as a string and which would fail the integer response schema.
  const sql = `
    SELECT
      routeName,
      COUNT(*) AS totalVisits,
      COUNT(DISTINCT userId) AS uniqueUsers,
      MAX(createdAt) AS lastVisited,
      CAST(SUM(deviceClass = 'mobile') AS SIGNED) AS mobileVisits,
      CAST(SUM(deviceClass = 'tablet') AS SIGNED) AS tabletVisits,
      CAST(SUM(deviceClass = 'desktop') AS SIGNED) AS desktopVisits,
      CAST(SUM(deviceClass IS NULL OR deviceClass = 'unknown') AS SIGNED) AS unknownVisits
    FROM analytics_events
    ${where}
    GROUP BY routeName
    ORDER BY totalVisits DESC
  `
  const [rows] = await dbUtils.pool.query(sql, params)
  return rows
}
