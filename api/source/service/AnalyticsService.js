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
  ])
  await dbUtils.pool.query(
    `INSERT INTO analytics_events (userId, eventType, routeName, path, eventName, metadata)
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

  const sql = `
    SELECT
      routeName,
      COUNT(*) AS totalVisits,
      COUNT(DISTINCT userId) AS uniqueUsers,
      MAX(createdAt) AS lastVisited
    FROM analytics_events
    ${where}
    GROUP BY routeName
    ORDER BY totalVisits DESC
  `
  const [rows] = await dbUtils.pool.query(sql, params)
  return rows
}
