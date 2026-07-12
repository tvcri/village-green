// Pure decision logic for the grant-editing UI. Grant shape here is the
// GET /users/{id}/grants array: { grantId, roleId, village: {..}|null };
// village === null marks a Hub (federation-scoped) grant.

export const HUB_SCOPE = 'hub'

// getUserGrants flat array -> unified display rows. village === null marks
// a Hub grant. The same row shape is built inline by UserCreate for staged
// (not-yet-persisted) grants, so keep it flat and JSON-simple.
export function toGrantRows(grants, getRoleLabel) {
  return (grants ?? []).map(g => ({
    grantId: g.grantId,
    villageId: g.village ? g.village.villageId : null,
    scopeLabel: g.village ? g.village.name : 'Hub',
    isHub: !g.village,
    roleId: g.roleId,
    roleLabel: getRoleLabel(g.roleId),
  }))
}

// Add Grant scope choices: Hub plus every village. Nothing is excluded —
// multi-role-per-scope is the point; per-role exclusion happens in
// availableRoles.
export function scopeOptions(villages) {
  return [
    { label: 'Hub', value: HUB_SCOPE },
    ...(villages ?? []).map(v => ({ label: v.name, value: v.villageId })),
  ]
}

// Options for the add-only role MultiSelect: roles valid for the chosen
// scope minus roles already held in that scope. Never pre-checks existing
// grants — unchecking must never delete.
export function availableRoles({ scopeValue, federationRoles, villageRoles, rows }) {
  if (scopeValue == null) return []
  const isHub = scopeValue === HUB_SCOPE
  const pool = isHub ? federationRoles : villageRoles
  const held = new Set(
    (rows ?? [])
      .filter(r => (isHub ? r.isHub : String(r.villageId) === String(scopeValue)))
      .map(r => String(r.roleId))
  )
  return pool.filter(r => !held.has(String(r.roleId)))
}
