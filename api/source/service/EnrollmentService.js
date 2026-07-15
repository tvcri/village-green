'use strict'

const { randomInt, randomBytes } = require('node:crypto')

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

module.exports = {
  normalizeEmail,
  generatePin,
  generateTempPassword,
  classifyEligibility,
}
