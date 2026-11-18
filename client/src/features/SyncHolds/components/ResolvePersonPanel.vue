<script setup>
import { computed, ref, watch } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import { getPersons } from '../../PersonList/api/personApi.js'

// "This is…": pick the VG person an unlinked LGL donor is. The sync's
// candidates come first; a last-name search finds anyone else. Whether the
// pick is allowed (already a donor, already someone else's answer) is the
// API's call; its reason shows in `error`.
const props = defineProps({
  donorName: { type: String, required: true },
  candidates: { type: Array, default: () => [] }, // [{ personId, fullName, displayName, isDonor }]
  error: { type: String, default: null },
  busy: { type: Boolean, default: false },
})
const emit = defineEmits(['choose', 'cancel'])

const query = ref('')
const results = ref([])
let seq = 0
let timer = null
watch(query, (q) => {
  clearTimeout(timer)
  const term = q.trim()
  if (term.length < 2) { results.value = []; return }
  timer = setTimeout(async () => {
    const mine = ++seq
    try {
      const found = await getPersons({ lastName: term })
      if (mine === seq) results.value = found ?? []
    }
    catch { if (mine === seq) results.value = [] }
  }, 250)
})

const candidateIds = computed(() => new Set(props.candidates.map(c => c.personId)))
const others = computed(() => results.value
  .filter(p => !candidateIds.value.has(String(p.personId)))
  .slice(0, 20)
  .map(p => ({
    personId: String(p.personId),
    fullName: p.fullName,
    // PersonSummary carries no displayName; the toast falls back to fullName.
    displayName: p.displayName ?? null,
    isDonor: Boolean(p.donor),
  })))
</script>

<template>
  <div class="resolve-panel">
    <p class="ask">Who is <strong>{{ donorName }}</strong> in VG?</p>
    <InputText v-model="query" placeholder="Search people by last name" aria-label="Search people by last name" class="search" />
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <ul class="pick-list">
      <template v-if="candidates.length">
        <li class="head">Suggested by the sync</li>
        <li v-for="p in candidates" :key="p.personId">
          <button type="button" :disabled="busy" @click="emit('choose', p)">
            <span>{{ p.fullName }}</span><span v-if="p.isDonor" class="meta">already a donor</span>
          </button>
        </li>
      </template>
      <template v-if="query.trim().length >= 2">
        <li class="head">Search results</li>
        <li v-for="p in others" :key="p.personId">
          <button type="button" :disabled="busy" @click="emit('choose', p)">
            <span>{{ p.fullName }}</span><span v-if="p.isDonor" class="meta">already a donor</span>
          </button>
        </li>
        <li v-if="!others.length" class="none">No other matches</li>
      </template>
    </ul>
    <div class="bar">
      <Button label="Cancel" severity="secondary" text size="small" @click="emit('cancel')" />
    </div>
  </div>
</template>

<style scoped>
.resolve-panel {
  grid-column: 1 / -1;
  background: var(--p-surface-50);
  border: 1px solid var(--p-surface-200);
  border-radius: 6px;
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.ask, .error { margin: 0; }
.error { color: var(--p-red-700); }
.search { max-width: 22rem; }
.pick-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.25rem; max-height: 16rem; overflow: auto; }
.pick-list .head { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--p-text-muted-color); font-weight: 600; padding-top: 0.25rem; }
.pick-list .none { color: var(--p-text-muted-color); }
.pick-list button {
  width: 100%;
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  text-align: left;
  font: inherit;
  background: var(--p-surface-0);
  border: 1px solid var(--p-surface-200);
  border-radius: 6px;
  padding: 0.4rem 0.65rem;
  cursor: pointer;
}
.pick-list button:hover { border-color: var(--p-primary-color); }
.meta { color: var(--p-text-muted-color); font-size: 0.85rem; }
</style>
