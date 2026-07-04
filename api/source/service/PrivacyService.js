'use strict'

const dbUtils = require('./utils')

exports.getPrivacyRules = async function () {
  const sql = `
    SELECT
      id,
      content,
      DATE_FORMAT(publishedAt, '%Y-%m-%dT%TZ') AS publishedAt,
      publishedByUserId,
      DATE_FORMAT(modifiedAt, '%Y-%m-%dT%TZ') AS modifiedAt,
      modifiedByUserId
    FROM privacy_rules
    ORDER BY id DESC
    LIMIT 1`
  const [rows] = await dbUtils.pool.query(sql)
  return rows[0] ?? null
}

exports.publishPrivacyRules = async function (content, userId, tokenClaims) {
  const [result] = await dbUtils.pool.query(
    `INSERT INTO privacy_rules (content, publishedAt, publishedByUserId)
     VALUES (?, UTC_TIMESTAMP(), ?)`,
    [content, userId]
  )
  // Auto-acknowledge on behalf of the publisher: authoring a version implies
  // agreement, so the admin who publishes never needs to see the ack modal.
  // Ack the exact row just created (result.insertId), not "current", to avoid
  // a race with a concurrent publish.
  await exports.createPrivacyAcknowledgement(userId, result.insertId, tokenClaims)
  return exports.getPrivacyRules()
}

exports.patchPrivacyRulesCurrent = async function (content, userId) {
  const current = await exports.getPrivacyRules()
  if (!current) return null
  const sql = `
    UPDATE privacy_rules
    SET content = ?, modifiedAt = UTC_TIMESTAMP(), modifiedByUserId = ?
    WHERE id = ?`
  await dbUtils.pool.query(sql, [content, userId, current.id])
  return exports.getPrivacyRules()
}

exports.createPrivacyAcknowledgement = async function (userId, rulesId, tokenClaims) {
  const sql = `
    INSERT INTO privacy_acknowledgement (userId, rulesId, acknowledgedAt, tokenClaims)
    VALUES (?, ?, UTC_TIMESTAMP(), ?)`
  const [result] = await dbUtils.pool.query(sql, [userId, rulesId, JSON.stringify(tokenClaims)])
  const [rows] = await dbUtils.pool.query(
    `SELECT id, rulesId, DATE_FORMAT(acknowledgedAt, '%Y-%m-%dT%TZ') AS acknowledgedAt
     FROM privacy_acknowledgement WHERE id = ?`,
    [result.insertId]
  )
  return rows[0]
}
