<script setup>
import { computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Select from 'primevue/select'
import SelectButton from 'primevue/selectbutton'
import { useToast } from 'primevue/usetoast'
import MetaPeopleTable from './MetaPeopleTable.vue'
import { getMetaMetricsPersons } from '../api/metaMetricsApi.js'
import { ACTIVITY_OPTIONS, ACTIVITY_VALUES, completedCount, inActivity, peopleCsvFilename } from '../lib/peopleRows.js'
import { useAsyncState } from '../../../shared/composables/useAsyncState.js'

const props = defineProps({
  start: { type: String, required: true },
  end: { type: String, required: true },
  // From the /metrics payload: every village in the caller's scope.
  villages: { type: Array, required: true },
})

defineOptions({ name: 'MetaPeoplePanel' })

const route = useRoute()
const router = useRouter()

const villageNames = computed(() => new Map(props.villages.map(v => [v.villageId, v.villageName])))

const VILLAGE_OPTIONS = computed(() => [
  { label: 'All villages', value: 'all' },
  ...props.villages.map(v => ({ label: v.villageName, value: v.villageId })),
])

// No default: the tab opens empty and loads nothing until a village (or All)
// is chosen. Same URL contract as the page's other selections — read when
// valid, fall back silently, never write a correction.
const village = computed({
  get: () => (VILLAGE_OPTIONS.value.some(o => o.value === route.query.village) ? route.query.village : null),
  set: (value) => { router.replace({ query: { ...route.query, village: value } }) },
})

const activity = computed({
  get: () => (ACTIVITY_VALUES.includes(route.query.activity) ? route.query.activity : 'all'),
  set: (value) => {
    if (!ACTIVITY_VALUES.includes(value)) return
    router.replace({ query: { ...route.query, activity: value } })
  },
})

let toast = null
onMounted(() => { toast = useToast() })

const { state: payload, isLoading, execute } = useAsyncState(
  () => getMetaMetricsPersons(props.start, props.end, village.value === 'all' ? undefined : village.value),
  {
    immediate: false,
    onError: () => toast?.add({
      severity: 'error',
      summary: 'Could not load people',
      detail: 'Try again, or pick a different range.',
      life: 6000,
    }),
  },
)

// Primitive key: the activity filter and sort are client-side and must not
// refetch. The panel mounts only while its tab is active (Tabs is lazy), so
// a fetch never happens from another tab.
const fetchKey = computed(() => (village.value ? `${props.start}|${props.end}|${village.value}` : ''))
watch(fetchKey, (key) => { if (key) execute() }, { immediate: true })

const filtered = (rows) => (rows ?? []).filter(r => inActivity(completedCount(r), activity.value))
const members = computed(() => filtered(payload.value?.members))
const volunteers = computed(() => filtered(payload.value?.volunteers))
const showVillage = computed(() => village.value === 'all')

const csvName = (list) => peopleCsvFilename({
  villageName: village.value === 'all' ? 'All villages' : villageNames.value.get(village.value),
  list,
  activity: activity.value,
  start: props.start,
  end: props.end,
})
</script>

<template>
  <div class="people-panel">
    <div class="panel-filters">
      <label for="peopleVillage">Village</label>
      <Select
        inputId="peopleVillage"
        v-model="village"
        :options="VILLAGE_OPTIONS"
        optionLabel="label"
        optionValue="value"
        placeholder="Choose a village"
        aria-label="Village"
      />
      <span class="filter-label">Completed</span>
      <SelectButton
        v-model="activity"
        :options="ACTIVITY_OPTIONS"
        optionLabel="label"
        optionValue="value"
        :allowEmpty="false"
        aria-label="Completed requests"
      />
    </div>
    <p class="people-note">
      Completed requests in this range; round-trip rides count as two.
      Everyone active is listed. People no longer active appear only if they
      completed something in this range.
    </p>

    <p v-if="!village" class="notice">Choose a village, or All villages, to list its people.</p>
    <p v-else-if="isLoading" class="notice">Loading people…</p>

    <div v-else-if="payload" class="people-grid">
      <section class="people-members">
        <MetaPeopleTable title="Members" :rows="members" nameHeader="Member" :showVillage="showVillage" :villageNames="villageNames" :csvFilename="csvName('members')" />
      </section>
      <section class="people-volunteers">
        <MetaPeopleTable title="Volunteers" :rows="volunteers" nameHeader="Volunteer" :showVillage="showVillage" :villageNames="villageNames" :csvFilename="csvName('volunteers')" />
      </section>
    </div>
  </div>
</template>

<style scoped>
.panel-filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 1rem;
  margin-bottom: 0.5rem;
}
.filter-label { margin-left: 0.5rem; }
.people-note {
  margin: 0 0 1rem;
  font-size: 0.8rem;
  color: var(--color-text-muted, #6b7280);
}
.notice { color: var(--color-text-muted, #6b7280); margin-top: 1.5rem; }
/* Side by side, like the village page's People tab; stacks on narrow screens.
   min-width: 0 lets a grid track shrink below its table's content. */
.people-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1.5rem;
  align-items: start;
}

@media (max-width: 900px) {
  .people-grid { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 640px) {
  .panel-filters { flex-direction: column; align-items: stretch; }
  .filter-label { margin-left: 0; }
}
</style>
