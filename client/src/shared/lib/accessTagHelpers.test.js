import { describe, expect, it } from 'vitest'
import { HUB_FILTER, abbreviateRole, accessSortString, buildAccessTags, matchesScopeFilter } from './accessTagHelpers.js'

// getUsersWithGrants projection shape
const user = (federationGrants, grants) => ({ federationGrants, grants })
const fed = (grantId, roleId, name) => ({ grantId, roleId, name })
const vil = (villageId, name, roles) => ({ villageId, name, roles })

describe('abbreviateRole', () => {
  it('abbreviates seeded roleIds', () => {
    expect(abbreviateRole(1, 'Local Service Coordinator')).toBe('LSC')
    expect(abbreviateRole(3, 'Village Lead')).toBe('Lead')
    expect(abbreviateRole(2, 'Steering Committee')).toBe('SC')
    expect(abbreviateRole(7, 'Service Coordinator')).toBe('SC')
  })
  it('falls back to the full name for unknown roleIds', () => {
    expect(abbreviateRole(99, 'Future Role')).toBe('Future Role')
  })
  it('tolerates string roleIds (route/JSON coercion)', () => {
    expect(abbreviateRole('4', 'Admin')).toBe('Admin')
  })
})

describe('buildAccessTags', () => {
  it('renders one hub tag first, then village tags sorted by name', () => {
    const tags = buildAccessTags(user(
      [fed(1, 5, 'Staff'), fed(2, 4, 'Admin')],
      {
        7: vil(7, 'Wood River', [{ roleId: 3, name: 'Village Lead' }, { roleId: 2, name: 'Steering Committee' }]),
        3: vil(3, 'Alton', [{ roleId: 1, name: 'Local Service Coordinator' }]),
      }
    ))
    expect(tags.map(t => t.text)).toEqual([
      'Hub: Staff·Admin',
      'Alton: LSC',
      'Wood River: Lead·SC',
    ])
    expect(tags[0]).toMatchObject({ key: 'hub', scopeType: 'hub', title: 'Staff, Admin' })
    expect(tags[2]).toMatchObject({ key: 'v7', scopeType: 'village', title: 'Village Lead, Steering Committee' })
  })
  it('returns [] for a grantless user and tolerates missing fields', () => {
    expect(buildAccessTags(user([], {}))).toEqual([])
    expect(buildAccessTags({})).toEqual([])
  })
})

describe('accessSortString', () => {
  it('joins tag texts for column sorting', () => {
    const u = user([fed(1, 6, 'Board')], { 7: vil(7, 'Wood River', [{ roleId: 3, name: 'Village Lead' }]) })
    expect(accessSortString(u)).toBe('Hub: Board Wood River: Lead')
  })
  it('is empty string for grantless users (sorts first)', () => {
    expect(accessSortString({})).toBe('')
  })
})

describe('matchesScopeFilter', () => {
  const u = user([fed(1, 5, 'Staff')], { 7: vil(7, 'Wood River', [{ roleId: 3, name: 'Village Lead' }]) })
  it('null filter matches everyone', () => {
    expect(matchesScopeFilter(u, null)).toBe(true)
    expect(matchesScopeFilter({}, null)).toBe(true)
  })
  it('HUB_FILTER matches only users with hub grants', () => {
    expect(matchesScopeFilter(u, HUB_FILTER)).toBe(true)
    expect(matchesScopeFilter(user([], {}), HUB_FILTER)).toBe(false)
  })
  it('villageId filter matches users granted in that village, tolerating type mismatch', () => {
    expect(matchesScopeFilter(u, 7)).toBe(true)
    expect(matchesScopeFilter(u, '7')).toBe(true)
    expect(matchesScopeFilter(u, 3)).toBe(false)
  })
})
