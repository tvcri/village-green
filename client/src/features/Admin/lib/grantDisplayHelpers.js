// Pure decision logic for the grant-editing UI. Grant shape here is the
// GET /users/{id}/grants array: { grantId, roleId, village: {..}|null };
// village === null marks a Hub (federation-scoped) grant.

export function splitGrants(grants) {
  const hubGrants = []
  const villageGrants = []
  for (const g of grants ?? []) {
    if (g.village) villageGrants.push(g)
    else hubGrants.push(g)
  }
  return { hubGrants, villageGrants }
}

export function toVillageGrantRows(villageGrants, getRoleLabel) {
  return villageGrants.map((g) => ({
    grantId: g.grantId,
    villageId: g.village.villageId,
    villageName: g.village.name,
    roleId: g.roleId,
    roleLabel: getRoleLabel(g.roleId),
  }))
}

export function hubSelectionState(hubGrants) {
  if (!hubGrants?.length) return { roleId: null, isMultiple: false }
  if (hubGrants.length === 1) return { roleId: String(hubGrants[0].roleId), isMultiple: false }
  return { roleId: null, isMultiple: true }
}

// The one-Hub-role-per-user convention is enforced here by convergence:
// any selection (including null = None) replaces ALL current hub grants.
// Create-before-delete ordering is the caller's job; this only decides what.
export function computeHubRoleOps(hubGrants, newRoleId) {
  const target = newRoleId == null ? null : String(newRoleId)
  const alreadyHeld = target !== null && hubGrants.some((g) => String(g.roleId) === target)
  return {
    createRoleId: target !== null && !alreadyHeld ? target : null,
    deleteGrantIds: hubGrants.filter((g) => String(g.roleId) !== target).map((g) => g.grantId),
  }
}
