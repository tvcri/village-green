'use strict'

const { randomInt, randomBytes } = require('node:crypto')
const { fetch } = require('undici')
const bcrypt = require('bcryptjs')
const dbUtils = require('./utils')
const KeycloakService = require('./KeycloakService')
const config = require('../utils/config')
const logger = require('../utils/logger')

const PIN_TTL_MINUTES = 15
const ATTEMPT_CAP = 5
const RESET_WINDOW_MINUTES = 10
const BCRYPT_ROUNDS = 10
// Visiting the app root triggers the normal OIDC redirect to Keycloak login,
// so '/' IS the login URL (design decision #5).
const LOGIN_URL = '/'

function normalizeEmail(raw) {
  return String(raw ?? '').trim().toLowerCase()
}

function generatePin() {
  return randomInt(0, 1000000).toString().padStart(6, '0')
}

function generateTempPassword() {
  // 9 random bytes -> 12 base64url chars. Keycloak forces a change on first
  // login (UPDATE_PASSWORD), so this only needs to be unguessable, not pretty.
  return randomBytes(9).toString('base64url')
}

// rows: person rows carrying isVolunteer/isMember flags. person.email is not
// unique, so several rows can match one email; an active volunteer row wins.
function classifyEligibility(rows) {
  const volunteer = rows.find(r => r.isVolunteer)
  if (volunteer) return { status: 'volunteer', personId: volunteer.id, firstName: volunteer.firstName }
  const member = rows.find(r => r.isMember)
  if (member) return { status: 'member_only', personId: member.id, firstName: member.firstName }
  return { status: 'not_found', personId: null, firstName: null }
}

async function getEligibility(email) {
  // person.email uses a case-insensitive collation; the normalized value
  // matches mixed-case stored emails without a LOWER() wrapper.
  const [rows] = await dbUtils.pool.query(
    `SELECT p.id, p.firstName,
       EXISTS (SELECT 1 FROM active_volunteer av WHERE av.personId = p.id) AS isVolunteer,
       EXISTS (SELECT 1 FROM active_member am WHERE am.personId = p.id) AS isMember
     FROM person p
     WHERE p.email = ?`,
    [email]
  )
  return classifyEligibility(rows)
}

async function insertRequest({ email, personId, pinHash, kind, outcome, ttlMinutes }) {
  if (ttlMinutes) {
    await dbUtils.pool.query(
      `INSERT INTO enrollment_request (email, personId, pinHash, kind, outcome, expiresAt)
       VALUES (?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))`,
      [email, personId, pinHash, kind, outcome, ttlMinutes]
    )
  }
  else {
    await dbUtils.pool.query(
      `INSERT INTO enrollment_request (email, personId, pinHash, kind, outcome, expiresAt)
       VALUES (?, ?, ?, ?, ?, NULL)`,
      [email, personId, pinHash, kind, outcome]
    )
  }
}

// Fire-and-forget: a PIN that cannot be delivered promptly is equivalent to an
// expired PIN (the user re-requests), so the send must never block or fail the
// request path. Errors are logged, never surfaced. The plaintext PIN exists
// only here and in the sidecar's memory.
function sendPinWebhook({ email, pin, firstName, kind }) {
  fetch(config.enrollment.sidecarUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, pin, firstName, kind })
  }).then(res => {
    if (!res.ok) logger.writeError('sendPinWebhook', 'enrollment', { status: res.status })
  }).catch(err => {
    logger.writeError('sendPinWebhook', 'enrollment', { message: err.message })
  })
}

exports.requestEnrollment = async function (rawEmail) {
  const email = normalizeEmail(rawEmail)
  const eligibility = await getEligibility(email)

  if (eligibility.status === 'not_found') {
    await insertRequest({ email, personId: null, pinHash: null, kind: null, outcome: 'not_found', ttlMinutes: null })
    return
  }

  if (eligibility.status === 'member_only') {
    await insertRequest({ email, personId: eligibility.personId, pinHash: null, kind: null, outcome: 'ineligible_member', ttlMinutes: null })
    // Durable informational email via the sidecar's polled queue.
    await dbUtils.pool.query(
      `INSERT INTO notification_event (eventType, serviceRequestId, payload)
       VALUES ('enroll_ineligible', NULL, ?)`,
      [JSON.stringify({ email, firstName: eligibility.firstName })]
    )
    return
  }

  // Active volunteer: Keycloak is the authority on account existence.
  let kind
  try {
    const existing = await KeycloakService.findUserByUsername(email)
    kind = existing ? 'existing_account' : 'new'
  }
  catch (err) {
    // Keycloak unavailable: keep the uniform response (no error leak). No PIN
    // is issued - same recovery semantics as a lost email (re-request later).
    logger.writeError('requestEnrollment', 'enrollment', { message: err.message })
    await insertRequest({ email, personId: eligibility.personId, pinHash: null, kind: null, outcome: 'kc_unavailable', ttlMinutes: null })
    return
  }

  const pin = generatePin()
  const pinHash = await bcrypt.hash(pin, BCRYPT_ROUNDS)
  await insertRequest({ email, personId: eligibility.personId, pinHash, kind, outcome: 'pin_sent', ttlMinutes: PIN_TTL_MINUTES })
  sendPinWebhook({ email, pin, firstName: eligibility.firstName, kind })
}

exports.verifyEnrollment = async function (rawEmail, pin) {
  const email = normalizeEmail(rawEmail)
  const [rows] = await dbUtils.pool.query(
    `SELECT id, personId, pinHash, kind
     FROM enrollment_request
     WHERE email = ? AND outcome = 'pin_sent' AND consumedAt IS NULL
       AND expiresAt > NOW() AND attempts < ?
     ORDER BY id DESC LIMIT 1`,
    [email, ATTEMPT_CAP]
  )
  const row = rows[0]
  if (!row) return null

  // Count the attempt before comparing so a failing caller burns the budget.
  await dbUtils.pool.query(
    `UPDATE enrollment_request SET attempts = attempts + 1 WHERE id = ?`, [row.id]
  )

  const match = await bcrypt.compare(String(pin), row.pinHash)
  if (!match) return null

  await dbUtils.pool.query(
    `UPDATE enrollment_request SET consumedAt = NOW() WHERE id = ?`, [row.id]
  )

  // Inbox control proven - safe to branch and return truthful state.
  if (row.kind === 'existing_account') {
    return { status: 'exists', loginUrl: LOGIN_URL }
  }

  const [persons] = await dbUtils.pool.query(
    `SELECT firstName, lastName FROM person WHERE id = ?`, [row.personId]
  )
  const person = persons[0] ?? {}
  const tempPassword = generateTempPassword()
  let userId
  try {
    userId = await KeycloakService.createUser({
      username: email, email, firstName: person.firstName, lastName: person.lastName
    })
  }
  catch (err) {
    if (err.status === 409) {
      // Account appeared between request and verify - treat as recovery.
      await KeycloakService.setTemporaryPassword({ username: email, password: tempPassword })
      return { status: 'created', tempPassword, loginUrl: LOGIN_URL }
    }
    throw err
  }
  await KeycloakService.setTemporaryPassword({ id: userId, password: tempPassword })
  return { status: 'created', tempPassword, loginUrl: LOGIN_URL }
}

// Recovery for the existing_account choice: the just-consumed row plus the
// re-presented PIN is the gate (design decision #4). Single-use via resetAt.
exports.resetEnrollmentPassword = async function (rawEmail, pin) {
  const email = normalizeEmail(rawEmail)
  const [rows] = await dbUtils.pool.query(
    `SELECT id, pinHash
     FROM enrollment_request
     WHERE email = ? AND kind = 'existing_account' AND consumedAt IS NOT NULL
       AND consumedAt > DATE_SUB(NOW(), INTERVAL ? MINUTE) AND resetAt IS NULL
     ORDER BY id DESC LIMIT 1`,
    [email, RESET_WINDOW_MINUTES]
  )
  const row = rows[0]
  if (!row) return null

  const match = await bcrypt.compare(String(pin), row.pinHash)
  if (!match) return null

  const tempPassword = generateTempPassword()
  await KeycloakService.setTemporaryPassword({ username: email, password: tempPassword })
  await dbUtils.pool.query(
    `UPDATE enrollment_request SET resetAt = NOW() WHERE id = ?`, [row.id]
  )
  return { status: 'reset', tempPassword, loginUrl: LOGIN_URL }
}

exports.normalizeEmail = normalizeEmail
exports.generatePin = generatePin
exports.generateTempPassword = generateTempPassword
exports.classifyEligibility = classifyEligibility
