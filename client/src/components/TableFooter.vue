<script setup>
// The standard list footer. Render it inside a DataTable's #paginatorcontainer
// slot and pass PrimeVue's slot props straight through:
//
//   <template #paginatorcontainer="footer">
//     <TableFooter v-bind="footer" v-model="pageRows">
//       <ExportButton ... />
//     </TableFooter>
//   </template>
//
// Every slot prop is declared below, even the unused ones, so none of them
// falls through onto the root <div> as an HTML attribute.
import { computed } from 'vue'
import Button from 'primevue/button'
import Select from 'primevue/select'

const props = defineProps({
  first: { type: Number, default: 0 },
  last: { type: Number, default: 0 },
  rows: { type: Number, default: null },
  page: { type: Number, default: 0 },
  pageCount: { type: Number, default: 0 },
  pageLinks: { type: Array, default: null },
  totalRecords: { type: Number, default: 0 },
  firstPageCallback: { type: Function, default: null },
  lastPageCallback: { type: Function, default: null },
  prevPageCallback: { type: Function, default: null },
  nextPageCallback: { type: Function, default: null },
  rowChangeCallback: { type: Function, default: null },
  changePageCallback: { type: Function, default: null }
})

// The page size. The parent's ref is also bound to the DataTable's :rows.
const pageRows = defineModel({ type: Number, required: true })

const PAGE_SIZES = [10, 25, 50, 100]

const isEmpty = computed(() => !props.totalRecords)
const onFirstPage = computed(() => isEmpty.value || props.page === 0)
const onLastPage = computed(() => isEmpty.value || props.page >= props.pageCount - 1)
</script>

<template>
  <div class="paginator-container">
    <Button icon="pi pi-angle-double-left" text rounded aria-label="First page" :disabled="onFirstPage" @click="firstPageCallback" />
    <Button icon="pi pi-chevron-left" text rounded aria-label="Previous page" :disabled="onFirstPage" @click="prevPageCallback" />
    <span class="paginator-info">{{ first }}–{{ last }} of {{ totalRecords }}</span>
    <Button icon="pi pi-chevron-right" text rounded aria-label="Next page" :disabled="onLastPage" @click="nextPageCallback" />
    <Button icon="pi pi-angle-double-right" text rounded aria-label="Last page" :disabled="onLastPage" @click="lastPageCallback" />
    <Select v-model="pageRows" :options="PAGE_SIZES" aria-label="Rows per page" />
    <slot />
  </div>
</template>
