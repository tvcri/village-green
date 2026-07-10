import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRouter, createWebHashHistory } from 'vue-router'

const mockHasPermission = vi.fn(() => false)
const mockHasVillageAccess = vi.fn(() => false)
const mockHasFederationAccess = { value: false }

vi.mock('../shared/composables/useCurrentUser.js', () => ({
  useCurrentUser: () => ({
    hasPermission: mockHasPermission,
    hasVillageAccess: mockHasVillageAccess,
    hasFederationAccess: mockHasFederationAccess,
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
