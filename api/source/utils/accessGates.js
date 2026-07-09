'use strict'
const SmError = require('./error')
const UserService = require('../service/UserService')

// Paths (relative to the /api mount) reachable by any authenticated user.
// Everything else is staff surface: deny-by-default (VSS design spec §2).
// /volunteer-requests is exempt here because it has its own gate below.
// Short-term operating assumption: all staff are admin/elevatable, so the
// privilege check admits every current staff user.
const STAFF_GATE_EXEMPT_PREFIXES = [
  '/user',
  '/op',
  '/privacy',
  '/oauth',
  '/volunteer-requests',
]

function isStaffGateExempt(path) {
  return STAFF_GATE_EXEMPT_PREFIXES.some(
    prefix => path === prefix || path.startsWith(`${prefix}/`)
  )
}

function hasStaffAccess(userObject) {
  if (userObject?.privileges?.admin) return true
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
// identity-derived: linked person with an active volunteer row, anywhere.
// Access is not village-scoped: any active volunteer can see and act on
// any village's open requests (VSS design refinement).
const requireVolunteerAccess = async function (req, res, next) {
  try {
    if (!req.userObject?.userId) return next()
    if (!req.userObject.personId) throw new SmError.PrivilegeError()
    const villages = await UserService.getVolunteerVillages(req.userObject.personId)
    if (!villages.length) throw new SmError.PrivilegeError()
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
