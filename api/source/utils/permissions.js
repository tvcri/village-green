'use strict'

// RBAC permission catalog — the single source of truth for permission keys.
// A permission is meaningful only where a service checks it, so definitions
// live in code; the DB (role_permission) stores only role→permission
// assignments. NOTE: "permission" here is RBAC authorization — unrelated to
// the volunteer-skills `capability` table/domain.
const catalog = {
  'person:read':              { description: 'Read person records', requiresElevation: false },
  'person:write':             { description: 'Create/update person records', requiresElevation: false },
  'person:read_confidential': { description: 'See confidential-notes columns in projections', requiresElevation: false },
  'member:read':              { description: 'Read member rosters', requiresElevation: false },
  'member:write':             { description: 'Create/update member records', requiresElevation: false },
  'member:read_financial':    { description: 'See dues/financial columns in projections', requiresElevation: false },
  'volunteer:read':           { description: 'Read volunteer rosters', requiresElevation: false },
  'volunteer:write':          { description: 'Manage volunteer records (not VSS self-service)', requiresElevation: false },
  'sr:read':                  { description: 'Read service requests', requiresElevation: false },
  'sr:write':                 { description: 'Create/update/assign service requests', requiresElevation: false },
  'friend:read':              { description: 'Read Friendly Calls & Visits submissions', requiresElevation: false },
  'friend:write':             { description: 'Create/update Friendly Calls & Visits submissions', requiresElevation: false },
  'village:read':             { description: 'Read village properties/settings', requiresElevation: false },
  'village:write':            { description: 'Update village properties/settings', requiresElevation: false },
  'village:create':           { description: 'Create villages', requiresElevation: true },
  'user:admin':               { description: 'Manage users', requiresElevation: true },
  'grant:admin':              { description: 'Assign/revoke role grants', requiresElevation: true },
  'app:admin':                { description: 'Operations endpoints: config, jobs, export/import, privacy rules', requiresElevation: true },
}

const WILDCARD = '*'
const elevatable = new Set(
  Object.entries(catalog)
    .filter(([, v]) => v.requiresElevation)
    .map(([k]) => k)
)

module.exports = { catalog, WILDCARD, elevatable, keys: Object.keys(catalog) }
