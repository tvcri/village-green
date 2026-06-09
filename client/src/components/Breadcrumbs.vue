<script setup>
import { computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAsyncState } from '../shared/composables/useAsyncState.js'
import { getVillages } from '../features/VillageList/api/villageApi.js'
import { getVillages as getAdminVillages } from '../features/Admin/api/villageGrantApi.js'
import { getUsers as getAdminUsers } from '../features/Admin/api/userGrantApi.js'

const router = useRouter()
const route = useRoute()

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
        crumbs.push({ label: 'Village Access' })
        break
      case 'admin-user-access':
        crumbs.push({ label: 'User Access' })
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
    crumbs.push({
      label: villageName,
      route: { name: 'village-detail', params: { villageId: vId } }
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
      crumbs.push({ label: 'Members' })
      break
    case 'member-detail':
      crumbs.push({ label: 'Members', route: { name: 'members', params: { villageId: vId } } })
      crumbs.push({ label: personName || 'Member' })
      break
    case 'volunteers':
      crumbs.push({ label: 'Volunteers' })
      break
    case 'volunteer-detail':
      crumbs.push({ label: 'Volunteers', route: { name: 'volunteers', params: { villageId: vId } } })
      crumbs.push({ label: personName || 'Volunteer' })
      break
    case 'service-requests':
      crumbs.push({ label: 'Service Requests' })
      break
    case 'service-request-detail':
      crumbs.push({ label: 'Service Requests', route: { name: 'service-requests', params: { villageId: vId } } })
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
        <button
          v-if="crumb.route"
          class="breadcrumb-link"
          @click="navigate(crumb)"
        >
          {{ crumb.label }}
        </button>
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
  transition: color 0.2s ease;
}

.breadcrumb-link:hover {
  color: var(--color-primary-hover);
  text-decoration: underline;
}

.breadcrumb-current {
  color: var(--color-text-primary);
  font-weight: 500;
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
