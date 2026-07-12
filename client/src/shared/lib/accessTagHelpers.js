// Display helpers for the grouped access tags on UserList. Input shape is
// the getUsersWithGrants projection: federationGrants array + grants object
// keyed by villageId. Scope is encoded in the tag: 'Hub: ...' or '<Village>: ...'.

// Keyed on seeded roleIds (isSystem = 1, no role-editing UI). 'SC' is
// deliberately overloaded — Steering Committee in village scope, Service
// Coordinator in hub scope; the scope prefix disambiguates. If roles ever
// become editable, replace these keys with an API-provided role.code.
export const ROLE_ABBREVIATIONS = {
  1: 'LSC',
  2: 'SC',
  3: 'Lead',
  4: 'Admin',
  5: 'Staff',
  6: 'Board',
  7: 'SC',
}

export function abbreviateRole(roleId, fullName) {
  return ROLE_ABBREVIATIONS[Number(roleId)] ?? fullName ?? `Role ${roleId}`
}

export function buildAccessTags(user) {
  const tags = []
  const hubGrants = user.federationGrants ?? []
  if (hubGrants.length) {
    tags.push({
      key: 'hub',
      scopeType: 'hub',
      text: `Hub: ${hubGrants.map(g => abbreviateRole(g.roleId, g.name)).join('·')}`,
      title: hubGrants.map(g => g.name).join(', '),
    })
  }
  const villages = Object.values(user.grants ?? {})
    .filter(v => (v.roles ?? []).length)
    .sort((a, b) => a.name.localeCompare(b.name))
  for (const v of villages) {
    tags.push({
      key: `v${v.villageId}`,
      scopeType: 'village',
      text: `${v.name}: ${v.roles.map(r => abbreviateRole(r.roleId, r.name)).join('·')}`,
      title: v.roles.map(r => r.name).join(', '),
    })
  }
  return tags
}

export function accessSortString(user) {
  return buildAccessTags(user).map(t => t.text).join(' ')
}

export const HUB_FILTER = 'hub'

export function matchesScopeFilter(user, filter) {
  if (filter == null) return true
  if (filter === HUB_FILTER) return (user.federationGrants ?? []).length > 0
  return Object.values(user.grants ?? {}).some(v => String(v.villageId) === String(filter))
}
