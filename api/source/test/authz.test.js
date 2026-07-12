'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { computeEffective, groupRoleDataByUser, hasPermission, hasElevatedPermission, holdsAnyElevatable } = require('../utils/authz')

const rows = [
  // Village Lead on village 3 (direct)
  { grantId: 10, roleId: 3, roleName: 'Village Lead', scope: 'village', villageId: 3, villageName: 'Elm', permission: 'member:read' },
  { grantId: 10, roleId: 3, roleName: 'Village Lead', scope: 'village', villageId: 3, villageName: 'Elm', permission: 'sr:read' },
  // Staff federation role (via group)
  { grantId: 20, roleId: 5, roleName: 'Staff', scope: 'federation', villageId: null, villageName: null, permission: 'sr:write' },
  { grantId: 20, roleId: 5, roleName: 'Staff', scope: 'federation', villageId: null, villageName: null, permission: 'member:read_financial' },
]

test('computeEffective shapes federation and village sets', () => {
  const eff = computeEffective(rows)
  assert.deepEqual(eff.permissions.federation.sort(), ['member:read_financial', 'sr:write'])
  assert.deepEqual(eff.permissions.byVillage['3'].sort(), ['member:read', 'sr:read'])
  assert.deepEqual(eff.federationGrants, [{ grantId: '20', roleId: '5', name: 'Staff' }])
  assert.deepEqual(eff.grants['3'].roles, [{ roleId: '3', name: 'Village Lead' }])
  assert.deepEqual(eff.grants['3'].grantIds, ['10'])
  assert.equal(eff.grants['3'].name, 'Elm')
})

test('computeEffective dedups the same role held via two distinct grants', () => {
  // Same (roleId 3, villageId 3) reachable both directly (grant 10) and via a
  // group (grant 11). grantIds must union; roles must not duplicate.
  const dupRows = [
    { grantId: 10, roleId: 3, roleName: 'Village Lead', scope: 'village', villageId: 3, villageName: 'Elm', permission: 'member:read' },
    { grantId: 11, roleId: 3, roleName: 'Village Lead', scope: 'village', villageId: 3, villageName: 'Elm', permission: 'member:read' },
  ]
  const eff = computeEffective(dupRows)
  assert.deepEqual(eff.grants['3'].roles, [{ roleId: '3', name: 'Village Lead' }])
  assert.deepEqual(eff.grants['3'].grantIds, ['10', '11'])
})

test('computeEffective handles empty input', () => {
  const eff = computeEffective([])
  assert.deepEqual(eff.permissions, { federation: [], byVillage: {} })
  assert.deepEqual(eff.federationGrants, [])
  assert.deepEqual(eff.grants, {})
})

test('groupRoleDataByUser groups batch rows by forUserId and strips forUserId', () => {
  const batchRows = [
    { forUserId: 1, ...rows[0] },
    { forUserId: 1, ...rows[1] },
    { forUserId: 2, ...rows[2] },
  ]
  const grouped = groupRoleDataByUser(batchRows)
  assert.deepEqual(grouped.get('1'), [rows[0], rows[1]])
  assert.deepEqual(grouped.get('2'), [rows[2]])
  // stripped rows feed computeEffective identically to the per-user query
  const eff = computeEffective(grouped.get('1'))
  assert.deepEqual(eff.grants['3'].grantIds, ['10'])
})

test('groupRoleDataByUser handles empty input and missing users', () => {
  const grouped = groupRoleDataByUser([])
  assert.equal(grouped.size, 0)
  assert.equal(grouped.get('99'), undefined)
})

function user(federation, byVillage = {}) {
  return { permissions: { federation, byVillage } }
}

test('hasPermission: federation grants apply everywhere', () => {
  const u = user(['sr:write'])
  assert.equal(hasPermission(u, 'sr:write'), true)
  assert.equal(hasPermission(u, 'sr:write', { villageId: '7' }), true)
  assert.equal(hasPermission(u, 'sr:read'), false)
})

test('hasPermission: village grants apply only to that village', () => {
  const u = user([], { 3: ['member:read'] })
  assert.equal(hasPermission(u, 'member:read', { villageId: 3 }), true)
  assert.equal(hasPermission(u, 'member:read', { villageId: '3' }), true)
  assert.equal(hasPermission(u, 'member:read', { villageId: 4 }), false)
  assert.equal(hasPermission(u, 'member:read'), false)
})

test('hasPermission: wildcard covers everything', () => {
  const u = user(['*'])
  assert.equal(hasPermission(u, 'user:admin'), true)
  assert.equal(hasPermission(u, 'member:read', { villageId: 99 }), true)
})

test('hasElevatedPermission requires held permission AND boolean elevate', () => {
  const u = user(['user:admin'])
  assert.equal(hasElevatedPermission(u, 'user:admin', { query: { elevate: true } }), true)
  assert.equal(hasElevatedPermission(u, 'user:admin', { query: { elevate: 'true' } }), false)
  assert.equal(hasElevatedPermission(u, 'user:admin', { query: {} }), false)
  assert.equal(hasElevatedPermission(user([]), 'user:admin', { query: { elevate: true } }), false)
  assert.throws(() => hasElevatedPermission(u, 'sr:read', { query: { elevate: true } }))
})

test('holdsAnyElevatable', () => {
  assert.equal(holdsAnyElevatable(user(['user:admin'])), true)
  assert.equal(holdsAnyElevatable(user(['*'])), true)
  assert.equal(holdsAnyElevatable(user(['sr:read'], { 3: ['member:read'] })), false)
})
