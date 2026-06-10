<script setup>
import { computed, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAsyncState } from '../shared/composables/useAsyncState.js'
import { getVillages } from '../features/VillageList/api/villageApi.js'
import { getVillages as getAdminVillages } from '../features/Admin/api/villageGrantApi.js'
import { getUsers as getAdminUsers } from '../features/Admin/api/userGrantApi.js'
import { siblingGroups, detailToListMap } from '../shared/config/siblingGroups.js'
import SplitButton from 'primevue/splitbutton'

const router = useRouter()
const route = useRoute()

const splitButtonRefs = new Map()

// Build reverse map at load time for O(1) lookups
const routeToGroupMap = Object.fromEntries(
  Object.entries(siblingGroups).flatMap(([groupName, routes]) =>
    routes.map(r => [r.name, groupName])
  )
)

function getSiblings(routeName, currentParams) {
  const groupName = routeToGroupMap[routeName]
  if (!groupName) return null

  return siblingGroups[groupName].map(sibling => ({
    label: sibling.label,
    route: { name: sibling.name, params: currentParams }
  }))
}

const { state: villages } = useAsyncState(
  () => getVillages(),
  { immediate: true, onError: null }
)

const { state: adminVillages } = useAsyncState(
  () => getAdminVillages(),
  { immediate: true, onError: null }
)

const { state: adminUsers } = useAsyncState(
  () => getAdminUsers(),
  { immediate: true, onError: null }
)

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
        crumbs.push({ label: 'User Access', siblings: getSiblings('admin-user-access', {}) })
        break
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
      case 'admin-create-user-grant': {
        const userId = route.params.userId
        const user = adminUsers.value?.find(u => u.userId === userId)
        const userName = user?.displayName || user?.username || `User ${userId}`
        crumbs.push({
          label: 'User Access',
          route: { name: 'admin-user-access', query: { userId } }
        })
        crumbs.push({
          label: userName,
          route: { name: 'admin-user-access', query: { userId } }
        })
        crumbs.push({ label: 'Create Grant' })
        break
      }
    }
    return crumbs
  }

  const vId = route.params.villageId

  if (vId && villages.value) {
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
  } else if (vId) {
    crumbs.push({
      label: `Village ${vId}`,
      route: { name: 'village-detail', params: { villageId: vId } }
    })
  }

  // Add page-specific breadcrumb
  const personName = route.params.personName
  switch (route.name) {
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
      crumbs.push({ label: 'Service Requests', route: { name: 'service-requests', params: { villageId: vId } }, siblings: getSiblings('service-requests', { villageId: vId }) })
      crumbs.push({ label: 'Request' })
      break
  }

  return crumbs
})

const navigate = (crumb) => {
  if (crumb.route) {
    router.push(crumb.route)
  }
}
</script>

<template>
  <nav class="breadcrumbs">
    <div class="breadcrumb-list">
      <template v-for="(crumb, index) in breadcrumbs" :key="index">
        <!-- Crumb with sibling dropdown -->
        <SplitButton
          v-if="crumb.siblings"
          :ref="el => { if (el) splitButtonRefs.set(index, el) }"
          :label="crumb.label"
          icon="pi pi-chevron-down"
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
          class="breadcrumb-splitbutton"
          @click="navigate(crumb)"
        />

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
}

.breadcrumb-link {
  background: none;
  border: none;
  color: var(--color-primary-highlight);
  cursor: pointer;
  padding: 0;
  text-decoration: none;
  font-weight: 600;
  transition: color 0.2s ease;
}

.breadcrumb-link:hover {
  color: var(--color-primary-hover);
  text-decoration: underline;
}

.breadcrumb-splitbutton :deep(.p-button) {
  background: none;
  border: none;
  color: var(--color-primary-highlight);
  padding: 0;
  font-weight: 600;
}

.breadcrumb-splitbutton :deep(.p-button:hover) {
  background-color: color-mix(in srgb, var(--color-primary-highlight) 10%, transparent);
  border-radius: 4px;
}

.breadcrumb-splitbutton :deep(.p-splitbutton-default-button) {
  padding: 0 6px;
}

.breadcrumb-splitbutton :deep(.p-splitbutton-menubutton) {
  padding: 0 4px;
  border-left: 1px solid rgba(96, 165, 250, 0.2);
}

.breadcrumb-current {
  color: var(--color-text-primary);
  font-weight: 600;
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

<style>
.breadcrumb-splitbutton :deep(.p-menuitem.p-focus > .p-menuitem-content),
.breadcrumb-splitbutton :deep(.p-menuitem:hover > .p-menuitem-content) {
  background-color: color-mix(in srgb, var(--color-primary-highlight) 12%, transparent);
}

.breadcrumb-splitbutton :deep(.p-menuitem > .p-menuitem-content .p-menuitem-text) {
  color: inherit;
}
</style>
