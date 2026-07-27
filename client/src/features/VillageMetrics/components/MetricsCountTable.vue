<script setup>
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import { useRouter } from 'vue-router'

const props = defineProps({
  rows: { type: Array, required: true },
  nameHeader: { type: String, required: true },
  linkRouteName: { type: String, default: null },
  villageId: { type: String, required: true },
})

const router = useRouter()

function goToPerson (row) {
  if (!props.linkRouteName) return
  router.push({ name: props.linkRouteName, params: { villageId: props.villageId, personId: row.personId } })
}
</script>

<template>
  <DataTable :value="rows" class="metrics-count-table">
    <template #empty>
      <span>No completed requests in this range.</span>
    </template>
    <Column field="fullName" :header="nameHeader" sortable>
      <template #body="{ data }">
        <a v-if="linkRouteName" href="#" class="person-link" @click.prevent="goToPerson(data)">{{ data.fullName }}</a>
        <span v-else>{{ data.fullName }}</span>
      </template>
    </Column>
    <Column field="count" header="Completed" sortable style="width: 8rem" />
  </DataTable>
</template>

<style scoped>
.person-link {
  color: var(--color-link, #2563eb);
  text-decoration: none;
  cursor: pointer;
}
.person-link:hover {
  text-decoration: underline;
}
</style>
