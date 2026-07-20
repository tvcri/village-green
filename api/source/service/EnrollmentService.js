'use strict'

const { randomInt } = require('node:crypto')
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
// The enroll page hands off to the app root, whose OIDC gate redirects to the
// Keycloak login (design decision #5). Returned relative ('./') so the browser
// resolves it against the enroll page's own document URL - correct under any
// reverse-proxy path prefix, which an absolute '/' would silently ignore.
const LOGIN_URL = './'

function normalizeEmail(raw) {
  return String(raw ?? '').trim().toLowerCase()
}

function generatePin() {
  return randomInt(0, 1000000).toString().padStart(6, '0')
}

// Must satisfy the Keycloak realm password policy: length >= 8, at least one
// upper, one lower, one special. base64url output cannot -- its alphabet
// ([A-Za-z0-9_-]) has no character Keycloak counts as special, so every reset
// was rejected with invalidPasswordMinSpecialCharsMessage.
const TEMP_PW_UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const TEMP_PW_LOWER = 'abcdefghijkmnopqrstuvwxyz'
const TEMP_PW_DIGIT = '23456789'
const TEMP_PW_SPECIAL = '!@#$%&*+-=?'
const TEMP_PW_ALL = TEMP_PW_UPPER + TEMP_PW_LOWER + TEMP_PW_DIGIT + TEMP_PW_SPECIAL
const TEMP_PW_LENGTH = 14

function pick(alphabet) {
  return alphabet[randomInt(0, alphabet.length)]
}

function generateTempPassword() {
  // One character guaranteed per required class, remainder free, then shuffled
  // so the required ones aren't pinned to known positions. Keycloak forces a
  // change on first login (UPDATE_PASSWORD), so this only needs to be
  // unguessable and policy-compliant, not memorable. Look-alike characters
  // (O/0, I/l/1) are excluded because users retype this from an email.
  const chars = [
    pick(TEMP_PW_UPPER),
    pick(TEMP_PW_LOWER),
    pick(TEMP_PW_DIGIT),
    pick(TEMP_PW_SPECIAL),
  ]
  while (chars.length < TEMP_PW_LENGTH) {
    chars.push(pick(TEMP_PW_ALL))
  }
  // Fisher-Yates with randomInt -- unbiased, unlike sort(() => Math.random()).
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
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

// Invalidate any prior live PIN for this email. Only unconsumed 'pin_sent'
// rows are superseded; consumed rows are left intact (the reset flow depends on
// the most-recently-consumed row within its window). Superseded rows are kept,
// not deleted — the outcome flip is the audit record that a newer PIN replaced
// them.
async function supersedeLivePins(email) {
  await dbUtils.pool.query(
    `UPDATE enrollment_request SET outcome = 'superseded'
     WHERE email = ? AND outcome = 'pin_sent' AND consumedAt IS NULL`,
    [email]
  )
}

// Fire-and-forget: a PIN that cannot be delivered promptly is equivalent to an
// expired PIN (the user re-requests), so the send must never block or fail the
// request path. Errors are logged, never surfaced. The plaintext PIN exists
// only here and in the sidecar's memory.
function sendPinWebhook({ email, pin, firstName, kind }) {
  // Fail closed: without the shared secret we cannot authenticate to the
  // sidecar, so skip the POST rather than send an unauthenticated PIN. The
  // caller still returns the uniform 200 (enumeration defense preserved).
  if (!config.enrollment.sidecarKey) {
    logger.writeError('sendPinWebhook', 'enrollment', { message: 'VG_ENROLL_SIDECAR_KEY unset; skipping PIN webhook' })
    return
  }
  fetch(config.enrollment.sidecarUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.enrollment.sidecarKey}`
    },
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
  // Supersede any prior live PIN for this email before issuing the new one, so
  // exactly one unconsumed 'pin_sent' row exists per email at any instant. This
  // is the invariant verify/reset already assume via ORDER BY id DESC — making
  // it true in storage removes the ambiguity (a stale older row can never be
  // the one a read resolves to) and shrinks the exposure to a single live PIN
  // rather than one-per-request. Only unconsumed rows are touched: an already
  // consumed row is the reset flow's gate within its window and must survive.
  // Superseded rows are retained (not deleted) as an audit trail of issuance.
  await supersedeLivePins(email)
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

  // Atomic single-use consume: only the caller that flips consumedAt from
  // NULL wins. A concurrent correct-PIN caller that loses the race gets
  // affectedRows === 0 and returns null, same as an invalid PIN.
  const [consumeResult] = await dbUtils.pool.query(
    `UPDATE enrollment_request SET consumedAt = NOW() WHERE id = ? AND consumedAt IS NULL`, [row.id]
  )
  if (consumeResult.affectedRows === 0) return null

  // Inbox control proven - safe to branch and return truthful state.
  if (row.kind === 'existing_account') {
    return { status: 'exists', loginUrl: LOGIN_URL }
  }

  const [persons] = await dbUtils.pool.query(
    `SELECT firstName, lastName FROM person WHERE id = ?`, [row.personId]
  )
  const person = persons[0] ?? {}
  const tempPassword = generateTempPassword()
  try {
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
  catch (err) {
    // Do not leak raw Keycloak errors (status/body/stack) to the anonymous
    // caller - log server-side and report as an invalid/expired PIN.
    logger.writeError('verifyEnrollment', 'enrollment', { message: err.message })
    return null
  }
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
       AND resetAttempts < ?
     ORDER BY id DESC LIMIT 1`,
    [email, RESET_WINDOW_MINUTES, ATTEMPT_CAP]
  )
  const row = rows[0]
  if (!row) return null

  // Count the reset attempt before comparing so a failing caller burns the
  // budget. resetAttempts is separate from the verify-path `attempts` so a
  // user who mistyped during verify still gets a full reset budget, while an
  // attacker cannot brute-force the 6-digit PIN against this second, unguarded
  // check (reset is a bare request the server can't tie back to the prior
  // verify). Same cap and pre-increment as verifyEnrollment.
  await dbUtils.pool.query(
    `UPDATE enrollment_request SET resetAttempts = resetAttempts + 1 WHERE id = ?`, [row.id]
  )

  const match = await bcrypt.compare(String(pin), row.pinHash)
  if (!match) return null

  const tempPassword = generateTempPassword()
  try {
    await KeycloakService.setTemporaryPassword({ username: email, password: tempPassword })
  }
  catch (err) {
    // Do not leak raw Keycloak errors to the anonymous caller, and do not
    // stamp resetAt - a failed KC call must not consume the single-use reset.
    logger.writeError('resetEnrollmentPassword', 'enrollment', { message: err.message })
    return null
  }
  await dbUtils.pool.query(
    `UPDATE enrollment_request SET resetAt = NOW() WHERE id = ?`, [row.id]
  )
  return { status: 'reset', tempPassword, loginUrl: LOGIN_URL }
}

exports.normalizeEmail = normalizeEmail
exports.generatePin = generatePin
exports.generateTempPassword = generateTempPassword
exports.classifyEligibility = classifyEligibility
exports.sendPinWebhook = sendPinWebhook
