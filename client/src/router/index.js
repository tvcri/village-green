import { createRouter, createWebHashHistory, createWebHistory } from 'vue-router'
import { navigationGuard } from './navigationGuards.js'
import { useAnalytics } from '../shared/composables/useAnalytics.js'

const routes = [
  {
    path: '/',
    name: 'villages',
    component: () => import('../features/VillageList/components/VillageList.vue'),
  },
  {
    path: '/villages/:villageId',
    name: 'village-detail',
    component: () => import('../features/VillageDetail/components/VillageDetail.vue'),
  },
  {
    path: '/villages/:villageId/members',
    name: 'members',
    component: () => import('../features/MemberList/components/MemberList.vue'),
  },
  {
    path: '/villages/:villageId/members/:personId/:personName?',
    name: 'member-detail',
    component: () => import('../features/MemberList/components/MemberDetail.vue'),
  },
  {
    path: '/villages/:villageId/volunteers',
    name: 'volunteers',
    component: () => import('../features/VolunteerList/components/VolunteerList.vue'),
  },
  {
    path: '/villages/:villageId/volunteers/:personId/:personName?',
    name: 'volunteer-detail',
    component: () => import('../features/VolunteerList/components/VolunteerDetail.vue'),
  },
  {
    path: '/villages/:villageId/service-requests',
    name: 'service-requests',
    component: () => import('../features/ServiceRequestList/components/ServiceRequestList.vue'),
  },
  {
    path: '/villages/:villageId/service-requests/:id',
    name: 'service-request-detail',
    component: () => import('../features/ServiceRequestList/components/ServiceRequestDetail.vue'),
  },
  {
    path: '/admin',
    name: 'admin',
    component: () => import('../features/Admin/components/AdminHub.vue'),
    meta: { requiresAdmin: true },
  },
  {
    path: '/admin/villages',
    name: 'admin-village-access',
    component: () => import('../features/Admin/components/VillageAccessList.vue'),
    meta: { requiresAdmin: true },
  },
  {
    path: '/admin/users',
    name: 'admin-user-access',
    component: () => import('../features/Admin/components/UserAccessList.vue'),
    meta: { requiresAdmin: true },
  },
  {
    path: '/admin/villages/grants/:villageId',
    name: 'admin-create-grant',
    component: () => import('../features/Admin/components/CreateGrant.vue'),
    meta: { requiresAdmin: true },
  },
  {
    path: '/admin/users/grants/:userId',
    name: 'admin-create-user-grant',
    component: () => import('../features/Admin/components/CreateUserGrant.vue'),
    meta: { requiresAdmin: true },
  },
  {
    path: '/admin/analytics',
    name: 'admin-analytics',
    component: () => import('../features/Admin/components/AnalyticsSummary.vue'),
    meta: { requiresAdmin: true },
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: { template: '<div style="padding: 2rem;"><h1>Page not found</h1></div>' },
  },
]

let historyBase
if (import.meta.env.DEV) {
  historyBase = import.meta.env.VITE_HASH_ROUTES === '1' ? null : '/'
}
else {
  historyBase = VG.Env.pathPrefix ? `${VG.Env.pathPrefix}client-v2/` : null
}

if (typeof window !== 'undefined') {
  history.scrollRestoration = 'manual'
}

const router = createRouter({
  history: historyBase ? createWebHistory(historyBase) : createWebHashHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 }
  },
})

router.beforeEach(navigationGuard)

const { trackPageView } = useAnalytics()
router.afterEach((to) => {
  trackPageView(to)
})

export default router
