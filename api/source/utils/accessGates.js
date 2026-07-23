'use strict'
const SmError = require('./error')

// Paths (relative to the /api mount) reachable by any authenticated user.
// Everything else is staff surface: deny-by-default (VSS design spec §2).
// /volunteer-requests is exempt here because it has its own gate below.
// With per-endpoint RBAC gates now in place (see
// docs/architecture/rbac-permission-matrix.md), this gate is defense-in-depth:
// it keeps grantless (e.g. volunteer-only) users off the staff surface,
// including the deliberately-ungated reference endpoints (matrix N2) and any
// future endpoint that ships without a permission gate.
const STAFF_GATE_EXEMPT_PREFIXES = [
  '/user',
  '/op',
  '/privacy',
  '/oauth',
  '/volunteer-requests',
  '/enrollment',
]

function isStaffGateExempt(path) {
  return STAFF_GATE_EXEMPT_PREFIXES.some(
    prefix => path === prefix || path.startsWith(`${prefix}/`)
  )
}

// Staff = holds any role grant, village- or federation-scoped (the server-side
// mirror of the client's isGrantless). Replaces the retired privileges.admin
// claim: admins now hold a federation-scoped role grant like other staff.
function hasStaffAccess(userObject) {
  if (userObject?.federationGrants?.length) return true
  return Object.keys(userObject?.grants ?? {}).length > 0
}

// Deny-by-default staff gate. Runs after setupUser; unauthenticated
// requests pass through for the OAS security handler to 401.
const requireStaffAccess = function (req, res, next) {
  try {
    if (!req.userObject?.userId) return next()
    if (isStaffGateExempt(req.path)) return next()
    if (!hasStaffAccess(req.userObject)) throw new SmError.PrivilegeError()
    next()
  } catch (e) {
    next(e)
  }
}

// Volunteer gate for /volunteer-requests/**. Volunteer access is
// identity-derived: personIds is the account's ACTIVE volunteers by
// construction (sqlResolvedPersonIds filters through active_volunteer), so a
// non-empty set IS the authorization. Access is not village-scoped: any
// active volunteer can see and act on any village's open requests (VSS design
// refinement).
const requireVolunteerAccess = async function (req, res, next) {
  try {
    if (!req.userObject?.userId) return next()
    if (!req.userObject.personIds?.length) throw new SmError.PrivilegeError()
    next()
  } catch (e) {
    next(e)
  }
}

module.exports = {
  isStaffGateExempt,
  hasStaffAccess,
  requireStaffAccess,
  requireVolunteerAccess,
}
