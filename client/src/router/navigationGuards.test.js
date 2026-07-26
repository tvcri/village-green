// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRouter, createWebHashHistory } from 'vue-router'

const mockHasPermission = vi.fn(() => false)
const mockHasVillageAccess = vi.fn(() => false)
const mockHasFederationAccess = { value: false }
const mockIsGrantless = { value: false }

// Mirror the real composable: user is computed(() => VG.curUser), so expose
// a live getter that reads whatever each test sets on globalThis.VG.
const mockUser = { get value() { return globalThis.VG?.curUser } }

vi.mock('../shared/composables/useCurrentUser.js', () => ({
  useCurrentUser: () => ({
    user: mockUser,
    hasPermission: mockHasPermission,
    hasVillageAccess: mockHasVillageAccess,
    hasFederationAccess: mockHasFederationAccess,
    isGrantless: mockIsGrantless,
  }),
}))

const { navigationGuard } = await import('./navigationGuards.js')

const Stub = { template: '<div>stub</div>' }

function createTestRouter() {
  const router = createRouter({
    history: createWebHashHistory(),
    routes: [
      { path: '/', name: 'home', component: Stub },
      { path: '/villages', name: 'villages', component: Stub },
      {
        path: '/villages/:villageId/members',
        name: 'members',
        component: Stub,
      },
      {
        path: '/admin/users',
        name: 'admin-users',
        component: Stub,
        meta: { requiresPermission: 'user:admin' },
      },
      {
        path: '/villages/:villageId/service-requests',
        name: 'service-requests',
        component: Stub,
        meta: { requiresPermission: 'sr:read', villageScoped: true },
      },
      {
        path: '/meta',
        name: 'meta',
        component: Stub,
      },
      { path: '/:pathMatch(.*)*', name: 'not-found', component: Stub },
    ],
  })

  router.beforeEach(navigationGuard)

  return router
}

describe('navigation guards', () => {
  beforeEach(() => {
    mockHasPermission.mockReturnValue(false)
    mockHasVillageAccess.mockReturnValue(false)
    mockHasFederationAccess.value = false
    mockIsGrantless.value = false
    globalThis.VG = { curUser: null }
  })

  describe('requiresPermission (federation)', () => {
    it('redirects to villages when user lacks the permission', async () => {
      const router = createTestRouter()
      mockHasPermission.mockReturnValue(false)
      await router.push('/admin/users')
      await router.isReady()
      expect(router.currentRoute.value.name).toBe('villages')
    })

    it('allows access when user has the permission', async () => {
      const router = createTestRouter()
      mockHasPermission.mockReturnValue(true)
      await router.push('/admin/users')
      await router.isReady()
      expect(router.currentRoute.value.name).toBe('admin-users')
      expect(mockHasPermission).toHaveBeenCalledWith('user:admin', undefined)
    })
  })

  describe('requiresPermission (villageScoped)', () => {
    it('checks the permission against the route villageId', async () => {
      const router = createTestRouter()
      mockHasPermission.mockReturnValue(true)
      await router.push('/villages/3/service-requests')
      await router.isReady()
      expect(router.currentRoute.value.name).toBe('service-requests')
      expect(mockHasPermission).toHaveBeenCalledWith('sr:read', '3')
    })

    it('redirects to villages when permission missing for that village', async () => {
      const router = createTestRouter()
      mockHasPermission.mockReturnValue(false)
      await router.push('/villages/3/service-requests')
      await router.isReady()
      expect(router.currentRoute.value.name).toBe('villages')
    })
  })

  describe('meta section', () => {
    it('redirects to villages when user has no federation access', async () => {
      const router = createTestRouter()
      mockHasFederationAccess.value = false
      await router.push('/meta')
      await router.isReady()
      expect(router.currentRoute.value.name).toBe('villages')
    })

    it('allows access when user has federation access', async () => {
      const router = createTestRouter()
      mockHasFederationAccess.value = true
      await router.push('/meta')
      await router.isReady()
      expect(router.currentRoute.value.name).toBe('meta')
    })
  })

  describe('village-scoped routes without requiresPermission', () => {
    it('redirects to villages when user has no grant on that village', async () => {
      const router = createTestRouter()
      mockHasVillageAccess.mockReturnValue(false)
      await router.push('/villages/3/members')
      await router.isReady()
      expect(router.currentRoute.value.name).toBe('villages')
    })

    it('allows access when user has a grant on that village', async () => {
      const router = createTestRouter()
      mockHasVillageAccess.mockReturnValue(true)
      await router.push('/villages/3/members')
      await router.isReady()
      expect(router.currentRoute.value.name).toBe('members')
      expect(mockHasVillageAccess).toHaveBeenCalledWith('3')
    })
  })

  describe('catch-all 404', () => {
    it('renders not-found for unknown route', async () => {
      const router = createTestRouter()
      await router.push('/nonexistent/page')
      await router.isReady()
      expect(router.currentRoute.value.name).toBe('not-found')
    })
  })
})

describe('volunteer surface', () => {
  beforeEach(() => {
    mockHasPermission.mockReturnValue(false)
    mockHasVillageAccess.mockReturnValue(false)
    mockHasFederationAccess.value = false
    mockIsGrantless.value = false
    globalThis.VG = { curUser: null }
  })

  it('blocks /volunteer for users without any volunteer entries', () => {
    globalThis.VG = { curUser: { volunteers: [] } }
    const result = navigationGuard({ name: 'volunteer', path: '/volunteer', params: {}, meta: { requiresVolunteer: true } })
    expect(result).toEqual({ name: 'villages' })
  })

  it('allows /volunteer for users with a volunteer entry', () => {
    globalThis.VG = { curUser: { volunteers: [{ personId: '7', villages: [{ villageId: '3' }] }] } }
    mockIsGrantless.value = true
    const result = navigationGuard({ name: 'volunteer', path: '/volunteer', params: {}, meta: { requiresVolunteer: true } })
    expect(result).toBeUndefined()
  })

  it('redirects volunteer-only (grantless) users to /volunteer from anywhere else', () => {
    globalThis.VG = { curUser: { volunteers: [{ personId: '7', villages: [{ villageId: '3' }] }] } }
    mockIsGrantless.value = true
    const result = navigationGuard({ name: 'villages', path: '/', params: {}, meta: {} })
    expect(result).toEqual({ name: 'volunteer' })
  })

  it('does not redirect grant-holding staff who also volunteer', () => {
    globalThis.VG = { curUser: { volunteers: [{ personId: '7', villages: [{ villageId: '3' }] }] } }
    mockIsGrantless.value = false
    const result = navigationGuard({ name: 'villages', path: '/', params: {}, meta: {} })
    expect(result).toBeUndefined()
  })

  it('allows volunteer-only users onto the request detail deep link', () => {
    globalThis.VG = { curUser: { volunteers: [{ personId: '7', villages: [{ villageId: '3' }] }] } }
    mockIsGrantless.value = true
    const result = navigationGuard({ name: 'volunteer-request-detail', path: '/volunteer/requests/2303', params: { id: '2303' }, meta: { requiresVolunteer: true } })
    expect(result).toBeUndefined()
  })
})
