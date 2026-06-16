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
    `INSERT INTO analytics_events (user_id, event_type, route_name, path, event_name, metadata)
     VALUES ?`,
    [values]
  )
}

module.exports.getSummary = async function ({ from, to, userId } = {}) {
  const predicates = [`event_type = 'page_view'`]
  const params = []

  if (from) {
    predicates.push(`created_at >= ?`)
    params.push(from)
  }
  if (to) {
    predicates.push(`created_at <= ?`)
    params.push(to)
  }
  if (userId) {
    predicates.push(`user_id = ?`)
    params.push(userId)
  }

  const where = predicates.length ? `WHERE ${predicates.join(' AND ')}` : ''

  const sql = `
    SELECT
      route_name AS routeName,
      COUNT(*) AS totalVisits,
      COUNT(DISTINCT user_id) AS uniqueUsers,
      MAX(created_at) AS lastVisited
    FROM analytics_events
    ${where}
    GROUP BY route_name
    ORDER BY totalVisits DESC
  `
  const [rows] = await dbUtils.pool.query(sql, params)
  return rows
}
