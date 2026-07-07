<script setup>
import { computed, ref, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAsyncState } from '../shared/composables/useAsyncState.js'
import { getVillages } from '../features/VillageList/api/villageApi.js'
import { getVillages as getAdminVillages } from '../features/Admin/api/villageGrantApi.js'
import { getUsers as getAdminUsers } from '../features/Admin/api/userGrantApi.js'
import { siblingGroups, detailToListMap } from '../shared/config/siblingGroups.js'
import { setPendingHighlight } from '../shared/lib/pendingHighlight.js'
import Menu from 'primevue/menu'

const router = useRouter()
const route = useRoute()

const menuRefs = new Map()

// Build reverse map at load time for O(1) lookups
const routeToGroupMap = Object.fromEntries(
  Object.entries(siblingGroups).flatMap(([groupName, routes]) =>
    routes.map(r => [r.name, groupName])
  )
)

function getSiblings(routeName, currentParams, excludeName) {
  const groupName = routeToGroupMap[routeName]
  if (!groupName) return null

  return siblingGroups[groupName]
    .filter(sibling => sibling.name !== excludeName)
    .map(sibling => ({
      label: sibling.label,
      route: { name: sibling.name, params: currentParams }
    }))
}

// Only needed for village-scoped and meta routes (village name/dropdown).
// Fetched lazily so the root villages route doesn't duplicate VillageList's
// own (differently-projected) fetch of the same data.
const { state: villages, execute: fetchVillages } = useAsyncState(
  () => getVillages(),
  { immediate: false, onError: null }
)

// Elevated-privilege lookups: only needed on the admin create-grant routes,
// so fetch lazily and on-demand rather than for every user on every page.
const { state: adminVillages, execute: fetchAdminVillages } = useAsyncState(
  () => getAdminVillages(),
  { immediate: false, onError: null }
)

const { state: adminUsers, execute: fetchAdminUsers } = useAsyncState(
  () => getAdminUsers(),
  { immediate: false, onError: null }
)

watch(() => route.name, (routeName) => {
  if (!routeName) return

  if (routeName === 'admin-create-grant' && adminVillages.value === null) {
    fetchAdminVillages()
  } else if (routeName === 'admin-user-grants' && adminUsers.value === null) {
    fetchAdminUsers()
  } else if (!routeName.startsWith('admin') && (route.params.villageId || routeName.startsWith('meta')) && villages.value === null) {
    fetchVillages()
  }
}, { immediate: true })

const breadcrumbs = computed(() => {
  const crumbs = [
    { label: 'Villages', route: { name: 'villages' } }
  ]

  // Handle admin routes first (to avoid adding village breadcrumb twice)
  if (route.name && route.name.startsWith('admin')) {
    crumbs[0] = { label: 'Admin', route: { name: 'admin' } }

    switch (route.name) {
      case 'admin-village-access':
        crumbs.push({ label: 'Village Access', siblings: getSiblings('admin-village-access', {}) })
        break
      case 'admin-user-access':
        crumbs.push({ label: 'Users', siblings: getSiblings('admin-user-access', {}) })
        break
      case 'admin-user-create':
        crumbs.push({
          label: 'Users',
          siblings: getSiblings('admin-user-access', {}, 'admin-user-access'),
          route: { name: 'admin-user-access' }
        })
        crumbs.push({ label: 'New User' })
        break
      case 'admin-user-grants': {
        const userId = route.params.userId
        const user = adminUsers.value?.find(u => u.userId === userId)
        const userName = route.params.displayName || user?.displayName || user?.username || `User ${userId}`
        crumbs.push({
          label: 'Users',
          route: { name: 'admin-user-access' }
        })
        crumbs.push({ label: userName })
        break
      }
      case 'admin-create-grant': {
        const villageId = route.params.villageId
        const village = adminVillages.value?.find(v => v.villageId === villageId)
        const villageName = village?.name || `Village ${villageId}`
        crumbs.push({
          label: 'Village Access',
          route: { name: 'admin-village-access', query: { villageId } }
        })
        crumbs.push({
          label: villageName,
          route: { name: 'admin-village-access', query: { villageId } }
        })
        crumbs.push({ label: 'Create Grant' })
        break
      }
    }
    return crumbs
  }

  const vId = route.params.villageId

  if (vId && villages.value && !(route.name === 'service-request-detail' && route.query.from === 'meta')) {
    const village = villages.value.find(v => v.villageId === vId)
    const villageName = village?.name || `Village ${vId}`

    // Determine the current descendant route (if any)
    // Detail routes map to their parent list routes
    const listRouteNames = siblingGroups['village-sections'].map(r => r.name)
    let descendantRouteName = 'village-detail'

    if (detailToListMap[route.name]) {
      descendantRouteName = detailToListMap[route.name]
    } else if (listRouteNames.includes(route.name)) {
      descendantRouteName = route.name
    }

    const siblingsList = villages.value.length > 1 ? villages.value.map(v => {
      const siblingRoute = { name: descendantRouteName, params: { ...route.params, villageId: v.villageId } }
      return {
        label: v.name,
        route: siblingRoute
      }
    }) : null

    crumbs.push({
      label: villageName,
      route: { name: 'village-detail', params: { villageId: vId } },
      siblings: siblingsList
    })
  } else if (vId && !(route.name === 'service-request-detail' && route.query.from === 'meta')) {
    crumbs.push({
      label: `Village ${vId}`,
      route: { name: 'village-detail', params: { villageId: vId } }
    })
  }

  // Add page-specific breadcrumb
  const personName = route.params.personName
  const metaSiblings = villages.value?.length
    ? [
        { label: 'Meta', route: { name: 'meta' } },
        ...villages.value.map(v => ({
          label: v.name,
          route: { name: 'village-detail', params: { villageId: v.villageId } }
        }))
      ]
    : null

  switch (route.name) {
    case 'meta':
      crumbs.push({ label: 'Meta', siblings: metaSiblings })
      break
    case 'meta-service-requests':
      crumbs.push({ label: 'Meta', route: { name: 'meta' }, siblings: metaSiblings })
      crumbs.push({ label: 'Service Requests', siblings: [
        { label: 'Persons', route: { name: 'meta-persons' } },
        { label: 'Friends', route: { name: 'meta-friends' } }
      ]})
      break
    case 'meta-service-request-create':
    case 'meta-service-request-edit':
      crumbs.push({ label: 'Meta', route: { name: 'meta' }, siblings: metaSiblings })
      crumbs.push({ label: 'Service Requests', route: { name: 'meta-service-requests' } })
      crumbs.push({ label: 'Request' })
      break
    case 'meta-persons':
      crumbs.push({ label: 'Meta', route: { name: 'meta' }, siblings: metaSiblings })
      crumbs.push({ label: 'Persons', siblings: [
        { label: 'Service Requests', route: { name: 'meta-service-requests' } },
        { label: 'Friends', route: { name: 'meta-friends' } }
      ]})
      break
    case 'meta-friends':
      crumbs.push({ label: 'Meta', route: { name: 'meta' }, siblings: metaSiblings })
      crumbs.push({ label: 'Friends', siblings: [
        { label: 'Persons', route: { name: 'meta-persons' } },
        { label: 'Service Requests', route: { name: 'meta-service-requests' } }
      ]})
      break
    case 'friends':
      crumbs.push({ label: 'Friends', siblings: getSiblings('friends', { villageId: vId }) })
      break
    case 'meta-person-detail':
      crumbs.push({ label: 'Meta', route: { name: 'meta' }, siblings: metaSiblings })
      crumbs.push({ label: 'Persons', route: { name: 'meta-persons' }, siblings: [
        { label: 'Service Requests', route: { name: 'meta-service-requests' } },
        { label: 'Friends', route: { name: 'meta-friends' } }
      ]})
      crumbs.push({ label: route.params.personName || 'Person' })
      break
    case 'meta-person-create':
      crumbs.push({ label: 'Meta', route: { name: 'meta' }, siblings: metaSiblings })
      crumbs.push({ label: 'Persons', route: { name: 'meta-persons' } })
      crumbs.push({ label: 'New Person' })
      break
    case 'meta-person-edit':
      crumbs.push({ label: 'Meta', route: { name: 'meta' }, siblings: metaSiblings })
      crumbs.push({ label: 'Persons', route: { name: 'meta-persons' } })
      crumbs.push({ label: 'Edit Person' })
      break
    case 'meta-person-member':
      crumbs.push({ label: 'Meta', route: { name: 'meta' }, siblings: metaSiblings })
      crumbs.push({ label: 'Persons', route: { name: 'meta-persons' } })
      crumbs.push({ label: 'Person', route: { name: 'meta-person-detail', params: { personId: route.params.personId } } })
      crumbs.push({ label: 'Member' })
      break
    case 'meta-person-volunteer':
      crumbs.push({ label: 'Meta', route: { name: 'meta' }, siblings: metaSiblings })
      crumbs.push({ label: 'Persons', route: { name: 'meta-persons' } })
      crumbs.push({ label: 'Person', route: { name: 'meta-person-detail', params: { personId: route.params.personId } } })
      crumbs.push({ label: 'Volunteer' })
      break
    case 'members':
      crumbs.push({ label: 'Members', siblings: getSiblings('members', { villageId: vId }) })
      break
    case 'member-detail':
      crumbs.push({ label: 'Members', route: { name: 'members', params: { villageId: vId } }, siblings: getSiblings('members', { villageId: vId }) })
      crumbs.push({ label: personName || 'Member' })
      break
    case 'volunteers':
      crumbs.push({ label: 'Volunteers', siblings: getSiblings('volunteers', { villageId: vId }) })
      break
    case 'volunteer-detail':
      crumbs.push({ label: 'Volunteers', route: { name: 'volunteers', params: { villageId: vId } }, siblings: getSiblings('volunteers', { villageId: vId }) })
      crumbs.push({ label: personName || 'Volunteer' })
      break
    case 'service-requests':
      crumbs.push({ label: 'Service Requests', siblings: getSiblings('service-requests', { villageId: vId }) })
      break
    case 'service-request-detail':
      if (route.query.from === 'meta') {
        crumbs.push({ label: 'Meta', route: { name: 'meta' } })
        crumbs.push({ label: 'Service Requests', route: { name: 'meta-service-requests' } })
      } else {
        crumbs.push({ label: 'Service Requests', route: { name: 'service-requests', params: { villageId: vId } }, siblings: getSiblings('service-requests', { villageId: vId }) })
      }
      crumbs.push({ label: 'Request' })
      break
  }

  return crumbs
})

const navigate = (crumb) => {
  if (crumb.route) {
    if (crumb.route.name === 'meta-service-requests' && route.name === 'service-request-detail') {
      setPendingHighlight(route.params.id)
    }
    router.push(crumb.route)
  }
}
</script>

<template>
  <nav class="breadcrumbs">
    <div class="breadcrumb-list">
      <template v-for="(crumb, index) in breadcrumbs" :key="index">
        <!-- Crumb with sibling dropdown -->
        <template v-if="crumb.siblings">
          <Menu
            :ref="el => { if (el) menuRefs.set(index, el) }"
            :model="crumb.siblings.filter(s => {
              // For routes with same name but different params (e.g., villages), compare params
              if (s.route.name === route.name) {
                return JSON.stringify(s.route.params) !== JSON.stringify(route.params)
              }
              // For different route names (e.g., admin sections), exclude if route name matches
              return s.route.name !== route.name
            }).map(s => ({
              label: s.label,
              command: () => router.push(s.route)
            }))"
            :popup="true"
          />
          <button
            :class="index === breadcrumbs.length - 1 ? 'breadcrumb-current' : ['breadcrumb-link', 'breadcrumb-link-label']"
            @click="index === breadcrumbs.length - 1 ? menuRefs.get(index)?.toggle($event) : navigate(crumb)"
          >
            {{ crumb.label }}
          </button>
          <button
            :class="['breadcrumb-link', index === breadcrumbs.length - 1 ? 'breadcrumb-current' : 'breadcrumb-link-dropdown']"
            @click="menuRefs.get(index)?.toggle($event)"
          >
            <i class="pi pi-chevron-down" />
          </button>
        </template>

        <!-- Crumb with route, no siblings -->
        <button
          v-else-if="crumb.route"
          class="breadcrumb-link"
          @click="navigate(crumb)"
        >
          {{ crumb.label }}
        </button>

        <!-- Current crumb (no route, no siblings) -->
        <span v-else class="breadcrumb-current">
          {{ crumb.label }}
        </span>

        <span v-if="index < breadcrumbs.length - 1" class="breadcrumb-separator">
          /
        </span>
      </template>
    </div>
  </nav>
</template>

<style scoped>
.breadcrumbs {
  position: sticky;
  top: 0;
  z-index: 10;
  padding: 1rem 2rem 0.5rem 2rem;
  background-color: var(--color-background-light);
  border-bottom: 1px solid var(--color-border-default);
}

.breadcrumb-list {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  font-size: 0.9rem;
  min-height: 1.2rem;
}

.breadcrumb-link {
  background: none;
  border: none;
  color: var(--p-primary-400);
  cursor: pointer;
  padding: 0;
  text-decoration: none;
  font-weight: 600;
  transition: color 0.2s ease;
}

.breadcrumb-link:hover {
  color: var(--p-primary-600);
  text-decoration: underline;
}

.breadcrumb-link-label:hover {
  color: var(--p-primary-600);
}

.breadcrumb-link-dropdown, .breadcrumb-current.breadcrumb-link {
  opacity: 0.75;
  padding: 0 2px;
}

.breadcrumb-link-dropdown:hover, .breadcrumb-current.breadcrumb-link:hover {
  background-color: color-mix(in srgb, var(--p-primary-400) 20%, transparent);
  border-radius: 4px;
  opacity: 1;
}

.breadcrumb-current {
  color: var(--color-text-primary);
  font-weight: 600;
  background: none;
  border: none;
  padding: 0;
  text-decoration: none;
  cursor: pointer;
}

.breadcrumb-separator {
  color: var(--color-text-dim);
  margin: 0 0.25rem;
}

@media (max-width: 768px) {
  .breadcrumbs {
    padding: 0.75rem 1rem 0.5rem 1rem;
  }

  .breadcrumb-list {
    font-size: 0.85rem;
    gap: 0.3rem;
  }
}
</style>
