<script setup>
import { computed, onActivated, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import HoldRow from './HoldRow.vue'
import { GROUPS, groupFor } from '../lib/holdReasons.js'
import { closeSyncHold, dismissSyncHold, getSyncHolds, resolveSyncHold } from '../api/syncHoldApi.js'
import { useCurrentUser } from '../../../shared/composables/useCurrentUser.js'
import { useScrollRestore } from '../../../shared/composables/useScrollRestore.js'

defineOptions({ name: 'SyncHolds' })

// The LGL sync screen: what the sync between VG and LGL left for a person,
// grouped into the situations staff recognise (VG-202611-521). The sync
// (tvcri/vg-sync) writes the holds and carries out staff answers on its next
// run; this page only reads them and records staff decisions.
const route = useRoute()
const router = useRouter()
const toast = useToast()
const { hasPermission } = useCurrentUser()
const canWrite = computed(() => hasPermission('sync:write'))

// App.vue keeps this page alive while staff open a person from it, so the
// view, search, collapsed groups and scroll position survive Back.
useScrollRestore('meta-sync-holds', 'meta-person-detail')

const STATES = [
  { value: 'open', label: 'Open' },
  { value: 'dismissed', label: 'Marked as seen' },
  { value: 'closed', label: 'Closed' },
]
const state = ref('open')
const search = ref('')
const holds = ref([])
const loading = ref(false)
const loaded = ref(false)

const personFilter = computed(() => route.query.personId ? String(route.query.personId) : null)
const filterPerson = computed(() => {
  for (const h of holds.value) {
    const p = (h.persons ?? []).find(x => x.personId === personFilter.value)
    if (p) return p
  }
  return null
})

async function load () {
  loading.value = true
  try {
    holds.value = await getSyncHolds({ state: [state.value] }) ?? []
  }
  catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Could not load the LGL sync list', life: 4000 })
  }
  finally {
    loading.value = false
    loaded.value = true
  }
}
onMounted(load)
watch(state, load)
// Re-fetch on return, so what was done on the person page shows (the first
// activation is the initial load).
let activatedOnce = false
onActivated(() => {
  if (activatedOnce) load()
  activatedOnce = true
})

const textOf = (h) => [
  ...(h.persons ?? []).map(p => p.fullName),
  h.detail?.lgl?.name, h.detail?.lgl?.email, h.lglConstituentId,
].filter(v => typeof v === 'string').join(' ').toLowerCase()

const visible = computed(() => {
  const q = search.value.trim().toLowerCase()
  return holds.value
    .filter(h => !personFilter.value || h.personId === personFilter.value ||
      (h.detail?.candidates ?? []).map(String).includes(personFilter.value))
    .filter(h => !q || textOf(h).includes(q))
})

const groups = computed(() => GROUPS
  .map(g => ({ ...g, holds: visible.value.filter(h => groupFor(h) === g) }))
  .filter(g => g.holds.length))

const startsOpen = (key) => Boolean(personFilter.value) || !['wont', 'engineer'].includes(key)
// Groups staff opened or closed keep that state across reloads; a new person
// filter starts from the defaults again.
const openGroups = ref({})
const isOpen = (key) => openGroups.value[key] ?? startsOpen(key)
const onToggle = (key, event) => { openGroups.value[key] = event.target.open }
watch(personFilter, () => { openGroups.value = {} })

const donorName = (h) => h.detail?.lgl?.name || `LGL donor ${h.lglConstituentId}`

// Performs one staff action. Rejects with the API's error so the row can
// show it; on success, says what happens next and reloads.
async function act (hold, action, payload) {
  let message
  switch (action) {
    case 'seen':
      await dismissSyncHold(hold.holdId)
      message = 'Marked as seen.'
      break
    case 'dontAdd':
      await dismissSyncHold(hold.holdId)
      message = `${donorName(hold)} won’t be added. Find them under Marked as seen to undo.`
      break
    case 'doneInLgl':
      await closeSyncHold(hold.holdId)
      message = 'Closed.'
      break
    case 'link':
      await resolveSyncHold(hold.holdId, { kind: 'link', personId: payload.personId })
      message = `Saved. The next sync run links ${donorName(hold)} to ${payload.displayName || payload.fullName}.`
      break
    case 'create':
      await resolveSyncHold(hold.holdId, { kind: 'create' })
      message = `Saved. The next sync run adds ${donorName(hold)} as a new person.`
      break
  }
  toast.add({ severity: 'success', summary: 'Saved', detail: message, life: 3500 })
  await load()
}

const clearPerson = () => router.replace({ query: {} })
</script>

<template>
  <div class="sync-holds">
    <h1>LGL sync</h1>
    <p class="lede">Things the sync between Village Green and LGL left for a person to look at.</p>

    <div class="toolbar">
      <div class="states" role="group" aria-label="Show">
        <Button v-for="s in STATES" :key="s.value" :label="s.label" size="small"
          :outlined="state !== s.value" :aria-pressed="state === s.value" @click="state = s.value" />
      </div>
      <InputText v-model="search" placeholder="Search by name or email" aria-label="Search by name or email" class="search" />
      <span v-if="personFilter" class="chip">
        Only {{ filterPerson?.fullName ?? `person ${personFilter}` }}
        <button type="button" aria-label="Show everyone" @click="clearPerson">×</button>
      </span>
    </div>

    <div v-if="loaded && !groups.length" class="empty">
      {{ state === 'open' ? 'Nothing waiting. The sync has nothing for staff right now.' : 'Nothing here.' }}
    </div>

    <details v-for="g in groups" :key="g.key" class="group" :class="{ engineer: g.key === 'engineer' }"
      :data-group="g.key" :open="isOpen(g.key)" @toggle="onToggle(g.key, $event)">
      <summary>
        <h2>{{ g.title }}</h2>
        <span class="count">{{ g.holds.length }}</span>
        <span class="what">{{ g.what }}</span>
      </summary>
      <HoldRow v-for="h in g.holds" :key="h.holdId" :hold="h" :can-write="canWrite"
        :act="(action, payload) => act(h, action, payload)" />
    </details>
  </div>
</template>

<style scoped>
/* Status colours for the rows (HoldRow, ResolvePersonPanel inherit them).
   Light/dark pairs as PersonList's tags; html.app-dark out-specifies the
   scoped light rule. */
.sync-holds {
  --hold-wait-bg: var(--p-amber-100);
  --hold-wait-fg: var(--p-amber-900);
  --hold-fail-bg: var(--p-red-100);
  --hold-fail-fg: var(--p-red-800);
  --hold-done-bg: var(--p-green-100);
  --hold-done-fg: var(--p-green-900);
  --hold-error-fg: var(--p-red-700);
}
:global(html.app-dark .sync-holds) {
  --hold-wait-bg: color-mix(in srgb, var(--p-amber-500), transparent 84%);
  --hold-wait-fg: var(--p-amber-300);
  --hold-fail-bg: color-mix(in srgb, var(--p-red-500), transparent 84%);
  --hold-fail-fg: var(--p-red-300);
  --hold-done-bg: color-mix(in srgb, var(--p-green-500), transparent 84%);
  --hold-done-fg: var(--p-green-300);
  --hold-error-fg: var(--p-red-400);
}
.sync-holds {
  padding: 2rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  max-width: 1100px;
}
h1 { margin: 0; color: var(--color-text-primary); }
.lede { margin: 0; color: var(--p-text-muted-color); }
.toolbar { display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: center; }
.states { display: inline-flex; gap: 0.25rem; }
.search { width: 16rem; max-width: 100%; }
.chip {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  background: var(--p-highlight-background);
  color: var(--p-highlight-color);
  border-radius: 999px;
  padding: 0.2rem 0.25rem 0.2rem 0.75rem;
}
.chip button { border: 0; background: transparent; color: inherit; cursor: pointer; font-size: 1rem; padding: 0 0.4rem; }
.empty {
  padding: 2rem 1rem;
  text-align: center;
  color: var(--p-text-muted-color);
  border: 1px dashed var(--p-content-border-color);
  border-radius: 8px;
}
.group { background: var(--p-content-background); color: var(--p-content-color); border: 1px solid var(--p-content-border-color); border-radius: 8px; }
.group > summary {
  list-style: none;
  cursor: pointer;
  padding: 0.75rem 1rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 0.75rem;
  align-items: baseline;
}
.group > summary::-webkit-details-marker { display: none; }
.group > summary::before { content: '▸'; color: var(--p-text-muted-color); width: 0.75rem; transition: transform 0.15s; }
.group[open] > summary::before { transform: rotate(90deg); }
.group h2 { font-size: 1rem; font-weight: 600; margin: 0; }
.group.engineer h2 { color: var(--p-text-muted-color); }
.count {
  border: 1px solid var(--p-content-border-color);
  border-radius: 999px;
  padding: 0 0.55rem;
  font-size: 0.8rem;
  font-variant-numeric: tabular-nums;
}
.what { flex-basis: 100%; color: var(--p-text-muted-color); font-size: 0.875rem; padding-left: 1.5rem; }
@media (max-width: 760px) {
  .sync-holds { padding: 1rem; }
  .what { padding-left: 0; }
}
</style>
