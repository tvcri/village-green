<script setup>
import { computed, ref, watch, onMounted, onActivated, onDeactivated } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useScrollRestore } from '../../../shared/composables/useScrollRestore.js'
import InputText from 'primevue/inputtext'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import { useToast } from 'primevue/usetoast'
import ExportButton from '../../../components/ExportButton.vue'
import { useAsyncState } from '../../../shared/composables/useAsyncState.js'
import { useDebouncedRef } from '../../../shared/composables/useDebouncedRef.js'
import { getVillageMembers } from '../api/memberApi.js'
import { toCsv, downloadCsv } from '../../../shared/lib/csvUtils.js'
import { createSheet } from '../../../shared/services/googleSheetsService.js'
import { useAnalytics } from '../../../shared/composables/useAnalytics.js'

defineOptions({ name: 'MemberList' })

const { trackEvent } = useAnalytics()

const router = useRouter()
const route = useRoute()

let toast = null

onMounted(() => {
  toast = useToast()
})

const villageId = computed(() => route.params.villageId)
const isCreatingSheet = ref(false)
const searchText = useDebouncedRef('', 300)
const sortField = ref('fullName')
const sortDir = ref('asc')

const { state: members, isLoading, error, execute: fetchMembers } = useAsyncState(
  () => villageId.value ? getVillageMembers(villageId.value) : null,
  { immediate: true }
)

useScrollRestore('members', 'member-detail')
const navigatedToDetail = ref(false)
const villageIdWhenNavigatedAway = ref(null)
const hasActivatedOnce = ref(false)
const fetchedByWatch = ref(false)
const { pause: pauseVillageWatch, resume: resumeVillageWatch } = watch(() => route.params.villageId, () => {
  fetchedByWatch.value = true
  searchText.immediate('')
  fetchMembers()
})
onDeactivated(pauseVillageWatch)
onActivated(() => {
  resumeVillageWatch()
  if (!hasActivatedOnce.value) {
    hasActivatedOnce.value = true
    return
  }
  if (fetchedByWatch.value) {
    fetchedByWatch.value = false
    return
  }
  if (navigatedToDetail.value && villageId.value === villageIdWhenNavigatedAway.value) {
    navigatedToDetail.value = false
    return
  }
  navigatedToDetail.value = false
  searchText.immediate('')
  fetchMembers()
})

const filteredMembers = computed(() => {
  if (!Array.isArray(members.value)) return []

  let result = members.value.filter(m =>
    m.fullName?.toLowerCase().includes(searchText.value.toLowerCase())
  )

  result.sort((a, b) => {
    const aVal = a[sortField.value] ?? ''
    const bVal = b[sortField.value] ?? ''
    const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0
    return sortDir.value === 'asc' ? cmp : -cmp
  })

  return result
})

const isEmpty = computed(() => !isLoading.value && filteredMembers.value.length === 0)

const membersForCsv = computed(() => {
  if (!Array.isArray(members.value)) return []
  return members.value.map(m => ({
    ...m,
    phone: m.phone?.phone ?? '',
    cell: m.phone?.cell ?? '',
    village: m.village?.name ?? ''
  }))
})

const clearSearch = () => searchText.immediate('')

const navigateToMember = (member) => {
  navigatedToDetail.value = true
  villageIdWhenNavigatedAway.value = villageId.value
  router.push({
    name: 'member-detail',
    params: { villageId: villageId.value, personId: member.personId }
  })
}

const columnsForCsv = [
  { header: 'Full Name', key: 'fullName' },
  { header: 'Village', key: 'village' },
  { header: 'Email', key: 'email' },
  { header: 'Phone', key: 'phone' },
  { header: 'Cell', key: 'cell' }
]

const handleDownloadCsv = async () => {
  const csv = toCsv(membersForCsv.value, columnsForCsv)
  const villageName = members.value?.[0]?.village?.name || 'village'
  const filename = `${villageName}-members.csv`
  downloadCsv(csv, filename)
}

async function handleCreateSheet() {
  try {
    isCreatingSheet.value = true

    const villageName = members.value?.[0]?.village?.name || 'Village Green'
    const sheetName = `${villageName} Members`

    const result = await createSheet(
      membersForCsv.value,
      columnsForCsv,
      sheetName
    )

    const sheetUrl = result.url || result

    if (result.popupBlocked) {
      // Popup was blocked, show link in toast
      if (toast) {
        toast.add({
          severity: 'success',
          summary: 'Sheet Created',
          detail: `Your Google Sheet has been created. <a href="${sheetUrl}" target="_blank" style="color: inherit; text-decoration: underline;">Open it here</a>.`,
          life: 0,
          contentStyleClass: 'bg-green-50 border-green-200',
        })
      }
    } else {
      // Popup opened successfully
      if (toast) {
        toast.add({
          severity: 'success',
          summary: 'Sheet Created',
          detail: 'Your Google Sheet has been created and opened in a new tab.',
          life: 3000,
        })
      }
    }
  } catch (err) {
    let message = 'Failed to create Google Sheet'
    if (err.message.includes('Popup was blocked')) {
      message = 'Please allow popups for this site to use Google Sheets export'
    } else if (err.message.includes('timeout')) {
      message = 'Sheet creation timed out. Please try again.'
    } else {
      message = `Error: ${err.message}`
    }

    if (toast) {
      toast.add({
        severity: 'error',
        summary: 'Sheet Creation Failed',
        detail: message,
        life: 5000,
      })
    } else {
      console.error(message)
    }
  } finally {
    isCreatingSheet.value = false
  }
}

</script>

<template>
  <div class="member-list">
    <div class="header-row">
      <h1>Members</h1>
      <ExportButton
        :disabled="isLoading || isCreatingSheet"
        @download="handleDownloadCsv"
        @export="handleCreateSheet"
      />
    </div>

    <div class="filter-section">
      <div class="search-box">
        <IconField style="width: 100%">
          <InputText
            v-model="searchText"
            type="text"
            placeholder="Search by name..."
            style="width: 100%"
          />
          <InputIcon v-if="searchText" class="pi pi-times" style="cursor: pointer" @click.stop="clearSearch" />
        </IconField>
      </div>
    </div>

    <div v-if="isLoading" class="loading-state">
      <p>Loading members...</p>
    </div>

    <div v-else-if="error" class="error-state">
      <p>Unable to load members. Please try again.</p>
    </div>

    <div v-else-if="isEmpty" class="empty-state">
      <p>No members found</p>
    </div>

    <!-- Desktop Table -->
    <DataTable
      v-else
      :value="filteredMembers"
      class="member-table-responsive desktop-only"
      :pt="{ tableContainer: { style: 'overflow: visible;' }, thead: { style: 'top: var(--breadcrumb-height); z-index: 1;' } }"
      @row-click="(event) => navigateToMember(event.data)"
      @filter="trackEvent('filter_applied')"
    >
      <Column field="fullName" header="Name" sortable style="width: 50%"></Column>
      <Column field="email" header="Email" sortable style="width: 30%"></Column>
      <Column header="Phone" style="width: 20%">
        <template #body="slotProps">
          {{ slotProps.data.phone?.phone || slotProps.data.phone?.cell || '—' }}
        </template>
      </Column>
    </DataTable>

    <!-- Mobile Card List -->
    <div class="member-cards mobile-only">
      <div
        v-for="member in filteredMembers"
        :key="member.personId"
        class="member-card"
        @click="navigateToMember(member)"
      >
        <h3>{{ member.fullName }}</h3>
        <div class="card-row">
          <span class="label">Email:</span>
          <span>{{ member.email ?? '—' }}</span>
        </div>
        <div class="card-row">
          <span class="label">Phone:</span>
          <span>{{ member.phone?.phone || member.phone?.cell || '—' }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.member-list {
  padding: 2rem;
}

.header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1.5rem;
}

h1 {
  margin: 1rem 0 0 0;
  color: var(--color-text-primary);
}

.filter-section {
  margin-bottom: 1.5rem;
  display: flex;
  gap: 1rem;
  align-items: center;
}

.search-box {
  width: 250px;
}

.loading-state,
.error-state,
.empty-state {
  text-align: center;
  padding: 2rem;
  color: var(--color-text-dim);
  font-style: italic;
}

.error-state {
  color: var(--color-text-error);
}

.member-table-responsive {
  cursor: pointer;
}

/* Mobile Card List */
.member-cards {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-top: 1rem;
}

.member-card {
  padding: 1rem;
  background-color: var(--color-background-light);
  border: 1px solid var(--color-border-default);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.member-card:active {
  background-color: var(--color-background-subtle);
}

.member-card h3 {
  margin: 0 0 0.75rem 0;
  font-size: 1rem;
  color: var(--color-text-primary);
}

.card-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.5rem;
  font-size: 0.9rem;
}

.card-row .label {
  color: var(--color-text-dim);
}

/* Responsive */
.desktop-only {
  width: 100%;
}

.mobile-only {
  display: none;
}

@media (max-width: 768px) {
  .member-list {
    padding: 1rem;
  }

  .search-input {
    max-width: 100%;
  }

  .desktop-only {
    display: none;
  }

  .mobile-only {
    display: flex;
  }
}
</style>
