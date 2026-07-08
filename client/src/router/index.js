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
    component: () => import('../features/ServiceRequestList/components/VillageServiceRequestList.vue'),
  },
  {
    path: '/villages/:villageId/service-requests/:id',
    name: 'service-request-detail',
    component: () => import('../features/ServiceRequestList/components/ServiceRequestDetail.vue'),
  },
  {
    path: '/villages/:villageId/friends',
    name: 'friends',
    component: () => import('../features/FriendList/components/FriendList.vue'),
  },
  {
    path: '/volunteer',
    name: 'volunteer',
    component: () => import('../features/VolunteerHome/components/VolunteerHome.vue'),
    meta: { requiresVolunteer: true },
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
    component: () => import('../features/Admin/components/UserList.vue'),
    meta: { requiresAdmin: true },
  },
  {
    path: '/admin/users/new',
    name: 'admin-user-create',
    component: () => import('../features/Admin/components/UserCreate.vue'),
    meta: { requiresAdmin: true },
  },
  {
    path: '/admin/users/:userId/grants',
    name: 'admin-user-grants',
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
    path: '/admin/analytics',
    name: 'admin-analytics',
    component: () => import('../features/Admin/components/AnalyticsSummary.vue'),
    meta: { requiresAdmin: true },
  },
  {
    path: '/admin/privacy',
    name: 'admin-privacy',
    component: () => import('../features/Admin/components/PrivacyRulesAdmin.vue'),
    meta: { requiresAdmin: true },
  },
  {
    path: '/meta',
    name: 'meta',
    component: () => import('../features/MetaVillage/components/MetaVillage.vue'),
  },
  {
    path: '/meta/service-requests',
    name: 'meta-service-requests',
    component: () => import('../features/ServiceRequestList/components/MetaServiceRequestList.vue'),
  },
  {
    path: '/meta/service-requests/create',
    name: 'meta-service-request-create',
    component: () => import('../features/ServiceRequestList/components/ServiceRequestCreateEdit.vue'),
  },
  {
    path: '/meta/service-requests/:id/edit',
    name: 'meta-service-request-edit',
    component: () => import('../features/ServiceRequestList/components/ServiceRequestCreateEdit.vue'),
  },
  {
    path: '/meta/persons',
    name: 'meta-persons',
    component: () => import('../features/PersonList/components/PersonList.vue'),
  },
  {
    path: '/meta/persons/create',
    name: 'meta-person-create',
    component: () => import('../features/PersonList/components/PersonEditForm.vue'),
  },
  {
    path: '/meta/persons/import',
    name: 'meta-person-import',
    component: () => import('../features/ApplicationImport/components/ApplicationImportWizard.vue'),
  },
  {
    path: '/meta/persons/:personId/edit',
    name: 'meta-person-edit',
    component: () => import('../features/PersonList/components/PersonEditForm.vue'),
  },
  {
    path: '/meta/persons/:personId/member',
    name: 'meta-person-member',
    component: () => import('../features/PersonList/components/MemberEdit.vue'),
  },
  {
    path: '/meta/persons/:personId/volunteer',
    name: 'meta-person-volunteer',
    component: () => import('../features/PersonList/components/VolunteerEdit.vue'),
  },
  {
    path: '/meta/persons/:personId/:personName?',
    name: 'meta-person-detail',
    component: () => import('../features/PersonList/components/PersonDetail.vue'),
  },
  {
    path: '/meta/friends',
    name: 'meta-friends',
    component: () => import('../features/FriendList/components/FriendList.vue'),
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
