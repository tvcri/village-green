<script setup>
import { computed, ref } from 'vue'
import Tag from 'primevue/tag'
import Button from 'primevue/button'
import { completedCount, isInactive, sortPeople, statusOf, peopleCsvColumns, peopleCsvRows } from '../lib/peopleRows.js'
import { toCsv, downloadCsv } from '../../../shared/lib/csvUtils.js'

const props = defineProps({
  rows: { type: Array, required: true },
  nameHeader: { type: String, required: true },
  // Only meaningful under "All villages"; a single village would repeat itself.
  showVillage: { type: Boolean, default: false },
  villageNames: { type: Map, required: true },
  csvFilename: { type: String, required: true },
})

defineOptions({ name: 'MetaPeopleTable' })

// A plain table, not DataTable: "All villages" puts ~870 members in one list,
// where DataTable's per-row cost runs to seconds (PR #124 measured ~5.6 s for
// 2,000 rows).
const sortField = ref('count')
const sortDir = ref('desc')

// A new column starts busiest-first for the count and A–Z for text.
function toggleSort (field) {
  if (sortField.value === field) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortField.value = field
    sortDir.value = field === 'count' ? 'desc' : 'asc'
  }
}

function sortIcon (field) {
  if (sortField.value !== field) return 'pi pi-sort-alt'
  return sortDir.value === 'asc' ? 'pi pi-sort-amount-up-alt' : 'pi pi-sort-amount-down'
}

function ariaSort (field) {
  if (sortField.value !== field) return 'none'
  return sortDir.value === 'asc' ? 'ascending' : 'descending'
}

const sorted = computed(() => sortPeople(props.rows, sortField.value, sortDir.value, props.villageNames))

// Exactly the list on screen, in its current order: village, bucket and sort
// are what the reader chose to look at.
function onDownloadCsv () {
  downloadCsv(toCsv(peopleCsvRows(sorted.value, props.villageNames), peopleCsvColumns(props.nameHeader)), props.csvFilename)
}
</script>

<template>
  <div class="table-actions">
    <Button
      icon="pi pi-download"
      label="Download CSV"
      text
      size="small"
      :disabled="!sorted.length"
      @click="onDownloadCsv"
    />
  </div>
  <table class="people-table">
    <colgroup>
      <col>
      <col v-if="showVillage" style="width: 30%">
      <col style="width: 9rem">
    </colgroup>
    <thead>
      <tr>
        <th class="sortable" :class="{ sorted: sortField === 'fullName' }" :aria-sort="ariaSort('fullName')" @click="toggleSort('fullName')">
          {{ nameHeader }} <i :class="sortIcon('fullName')" />
        </th>
        <th v-if="showVillage" class="sortable" :class="{ sorted: sortField === 'village' }" :aria-sort="ariaSort('village')" @click="toggleSort('village')">
          Village <i :class="sortIcon('village')" />
        </th>
        <th class="sortable count-col" :class="{ sorted: sortField === 'count' }" :aria-sort="ariaSort('count')" @click="toggleSort('count')">
          Completed <i :class="sortIcon('count')" />
        </th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="row in sorted" :key="row.personId">
        <td>
          <span class="person-name">{{ row.fullName }}</span>
          <Tag v-if="isInactive(row)" class="inactive-tag" :value="statusOf(row)" severity="secondary" />
        </td>
        <td v-if="showVillage">{{ villageNames.get(row.villageId) ?? '—' }}</td>
        <td class="count-col">{{ completedCount(row) }}</td>
      </tr>
      <tr v-if="!sorted.length" class="empty-row">
        <td :colspan="showVillage ? 3 : 2">No one in this range.</td>
      </tr>
    </tbody>
  </table>
</template>

<style scoped>
.table-actions {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 0.25rem;
}

/* Styled with the semantic tokens: the --p-datatable-* variables exist only
   once some DataTable has mounted. Fixed layout so the columns hold. */
.people-table {
  width: 100%;
  table-layout: fixed;
  border-collapse: separate;
  border-spacing: 0;
  background: var(--p-content-background);
  color: var(--p-content-color);
}

.people-table th,
.people-table td {
  padding: 0.5rem 0.75rem;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  border-bottom: 1px solid var(--p-content-border-color);
}

.people-table thead th {
  position: sticky;
  top: calc(var(--breadcrumb-height) + var(--toolbar-height, 0px));
  z-index: 1;
  background: var(--p-content-background);
  font-weight: 600;
}

.people-table th.sortable {
  cursor: pointer;
  user-select: none;
}

.people-table th.sortable i {
  margin-left: 0.35rem;
  font-size: 0.8rem;
  color: var(--p-text-muted-color);
}

.people-table th.sorted {
  /* The highlight token is translucent; layer it on an opaque base so rows
     scrolling under the sticky header don't show through. */
  background: linear-gradient(var(--p-highlight-background), var(--p-highlight-background)), var(--p-content-background);
  color: var(--p-highlight-color);
}

.people-table th.sorted i { color: var(--p-highlight-color); }

/* Numbers read better right-aligned against the column edge. */
.people-table .count-col { text-align: right; }

.people-table tbody tr:nth-child(even) { background: var(--color-background-subtle); }
.people-table tbody tr:hover { background: var(--p-content-hover-background); }

.inactive-tag {
  margin-left: 0.5rem;
  font-size: 0.75rem;
  padding: 0.05rem 0.4rem;
}

.empty-row td {
  color: var(--color-text-dim);
  font-style: italic;
  text-align: center;
}
</style>
