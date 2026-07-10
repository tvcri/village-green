'use strict'
const { catalog, WILDCARD, elevatable } = require('./permissions')

// Assemble the per-request effective-permission structures from the flat
// role-data rows returned by UserService.getUserRoleData(). All ids are
// stringified here so downstream JSON responses are consistent.
function computeEffective(rows) {
  const federation = new Set()
  const byVillage = {}
  const federationGrants = new Map()
  const grants = {}
  for (const r of rows) {
    if (r.scope === 'federation') {
      if (r.permission) federation.add(r.permission)
      federationGrants.set(String(r.grantId), {
        grantId: String(r.grantId),
        roleId: String(r.roleId),
        name: r.roleName,
      })
    }
    else {
      const vid = String(r.villageId)
      byVillage[vid] ??= new Set()
      if (r.permission) byVillage[vid].add(r.permission)
      grants[vid] ??= { villageId: vid, name: r.villageName, roles: [], grantIds: [] }
      if (!grants[vid].grantIds.includes(String(r.grantId))) {
        grants[vid].grantIds.push(String(r.grantId))
        grants[vid].roles.push({ roleId: String(r.roleId), name: r.roleName })
      }
    }
  }
  return {
    permissions: {
      federation: [...federation],
      byVillage: Object.fromEntries(
        Object.entries(byVillage).map(([k, v]) => [k, [...v]])
      ),
    },
    federationGrants: [...federationGrants.values()],
    grants,
  }
}

function hasPermission(userObject, permission, { villageId } = {}) {
  const p = userObject?.permissions
  if (!p) return false
  if (p.federation.includes(WILDCARD) || p.federation.includes(permission)) return true
  if (villageId !== undefined && villageId !== null) {
    return !!p.byVillage[String(villageId)]?.includes(permission)
  }
  return false
}

// Only meaningful for elevation-flagged permissions; calling it with any
// other permission is a programming error, not an authorization decision.
function hasElevatedPermission(userObject, permission, req) {
  if (!catalog[permission]?.requiresElevation) {
    throw new Error(`hasElevatedPermission called with non-elevatable permission: ${permission}`)
  }
  return hasPermission(userObject, permission) && req.query.elevate === true
}

function holdsAnyElevatable(userObject) {
  const federation = userObject?.permissions?.federation ?? []
  return federation.includes(WILDCARD) || federation.some(p => elevatable.has(p))
}

module.exports = { computeEffective, hasPermission, hasElevatedPermission, holdsAnyElevatable }
