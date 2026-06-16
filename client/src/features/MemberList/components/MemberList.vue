<script setup>
import { computed, ref, watch, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useScrollRestore } from '../../../shared/composables/useScrollRestore.js'
import InputText from 'primevue/inputtext'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import Button from 'primevue/button'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Tag from 'primevue/tag'
import { useToast } from 'primevue/usetoast'
import ExportButton from '../../../components/ExportButton.vue'
import { useAsyncState } from '../../../shared/composables/useAsyncState.js'
import { useDebouncedRef } from '../../../shared/composables/useDebouncedRef.js'
import { useRefetchOnChange } from '../../../shared/composables/useRefetchOnChange.js'
import { useCeDumpRefresh } from '../../../shared/composables/useCeDumpRefresh.js'
import { getVillageMembers } from '../api/memberApi.js'
import { getVillagePersons } from '../../../shared/api/villageApi.js'
import { toCsv, downloadCsv } from '../../../shared/lib/csvUtils.js'
import { createSheet } from '../../../shared/services/googleSheetsService.js'
import { useAnalytics } from '../../../shared/composables/useAnalytics.js'

defineOptions({ name: 'MemberList' })

const { trackEvent } = useAnalytics()

const getMemberLevelSeverity = (level) => {
  if (level === 'Primary') return 'success'
  if (level === 'Secondary') return 'info'
  return 'secondary'
}

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

const { state: persons, execute: fetchPersons } = useAsyncState(
  () => villageId.value ? getVillagePersons(villageId.value) : null,
  { immediate: true }
)

useRefetchOnChange(villageId, [fetchMembers, fetchPersons])
useScrollRestore('members', 'member-detail')
useCeDumpRefresh(() => fetchMembers())
watch(villageId, () => {
  searchText.immediate('')
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
  if (!Array.isArray(members.value) || !Array.isArray(persons.value)) return []
  return members.value.map(m => {
    const p = persons.value?.find(p => p.personId === m.personId) ?? {}
    return { ...p, ...m }
  })
})

const clearSearch = () => searchText.immediate('')

const navigateToMember = (member) => {
  router.push({
    name: 'member-detail',
    params: { villageId: villageId.value, personId: member.personId }
  })
}

const columnsForCsv = [
  { header: 'Full Name', key: 'fullName' },
  { header: 'Member #', key: 'memberNumber' },
  { header: 'Member Level', key: 'memberLevel' },
  { header: 'Join Date', key: 'joinDate' },
  { header: 'Service Notes', key: 'serviceNotes' },
  { header: 'Email', key: 'email' },
  { header: 'Phone', key: 'phone' },
  { header: 'Cell', key: 'cell' },
  { header: 'Address', key: 'address' },
  { header: 'City', key: 'city' },
  { header: 'State', key: 'state' },
  { header: 'Zip', key: 'zip' },
  { header: 'Birth Date', key: 'birthDate' },
  { header: 'Emergency Contact Name', key: 'emergencyContactName' },
  { header: 'Emergency Contact Relationship', key: 'emergencyContactRelationship' },
  { header: 'Emergency Contact Phone', key: 'emergencyContactPhone' },
  { header: 'Emergency Contact Email', key: 'emergencyContactEmail' }
]

const handleDownloadCsv = () => {
  const csv = toCsv(membersForCsv.value, columnsForCsv)
  const villageName = persons.value?.[0]?.village?.name || 'village'
  const filename = `${villageName}-members.csv`
  downloadCsv(csv, filename)
}

async function handleCreateSheet() {
  try {
    isCreatingSheet.value = true

    const villageName = persons.value?.[0]?.village?.name || 'Village Green'
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
      <Column field="fullName" header="Name" sortable style="width: 25%"></Column>
      <Column header="Level" sortable style="width: 25%">
        <template #body="slotProps">
          <Tag
            v-if="slotProps.data.memberLevel"
            :value="slotProps.data.memberLevel"
            :severity="getMemberLevelSeverity(slotProps.data.memberLevel)"
          />
          <span v-else class="text-dim">—</span>
        </template>
      </Column>
      <Column field="joinDate" header="Join Date" sortable style="width: 25%"></Column>
      <Column field="memberNumber" header="Member #" sortable style="width: 25%"></Column>
    </DataTable>

    <!-- Mobile Card List -->
    <div class="member-cards mobile-only">
      <div
        v-for="member in filteredMembers"
        :key="member.memberId"
        class="member-card"
        @click="navigateToMember(member)"
      >
        <h3>{{ member.fullName }}</h3>
        <div class="card-row">
          <span class="label">Member #:</span>
          <span>{{ member.memberNumber ?? '—' }}</span>
        </div>
        <div class="card-row">
          <span class="label">Level:</span>
          <Tag
            v-if="member.memberLevel"
            :value="member.memberLevel"
            :severity="getMemberLevelSeverity(member.memberLevel)"
          />
          <span v-else class="text-dim">—</span>
        </div>
        <div class="card-row">
          <span class="label">Joined:</span>
          <span>{{ member.joinDate ?? '—' }}</span>
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
