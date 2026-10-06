<script setup>
// Name search shared by the training and position pages (UI spec §8). The
// host page owns the rules: `status` says whether a person can be picked
// (and why not); `meta` is the second line. This component only types and picks.
import { ref, computed } from 'vue'
import InputText from 'primevue/inputtext'

const props = defineProps({
  candidates: { type: Array, required: true },
  status: { type: Function, default: () => ({ disabled: false, reason: null }) },
  meta: { type: Function, default: null },
  label: { type: String, default: 'Add volunteers' },
  placeholder: { type: String, default: 'Type a name, then press Enter or click a match' },
  inputId: { type: String, default: 'volunteer-search' },
})
const emit = defineEmits(['select'])

const query = ref('')
const open = ref(false)
const highlighted = ref(0)

const matches = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (q.length < 2) return []
  return props.candidates
    .filter(p => p.fullName.toLowerCase().includes(q) || (p.displayName ?? '').toLowerCase().includes(q))
    .map(p => ({ person: p, ...props.status(p) }))
    .sort((a, b) => (Number(!!a.disabled) - Number(!!b.disabled)) || a.person.fullName.localeCompare(b.person.fullName))
    .slice(0, 8)
})

function defaultMeta (p) {
  return `${p.village?.name ?? 'Hub volunteer'} · ${p.active ? 'Active' : 'Inactive'}`
}

function choose (m) {
  if (!m || m.disabled) return
  emit('select', m.person)
  query.value = ''
  highlighted.value = 0
}

function onInput () {
  open.value = true
  highlighted.value = 0
}

function onKeydown (e) {
  const list = matches.value
  if (e.key === 'ArrowDown') { highlighted.value = Math.min(highlighted.value + 1, list.length - 1); e.preventDefault() }
  else if (e.key === 'ArrowUp') { highlighted.value = Math.max(highlighted.value - 1, 0); e.preventDefault() }
  else if (e.key === 'Enter') {
    e.preventDefault()
    const pick = list[highlighted.value]
    choose(pick && !pick.disabled ? pick : list.find(m => !m.disabled))
  }
  else if (e.key === 'Escape') { query.value = ''; open.value = false }
}
</script>

<template>
  <div class="volunteer-search">
    <label :for="inputId" class="label">{{ label }}</label>
    <InputText :id="inputId" v-model="query" type="search" autocomplete="off" :placeholder="placeholder"
               class="w-full" role="combobox" :aria-expanded="open && matches.length > 0"
               @focus="open = true" @blur="open = false" @input="onInput" @keydown="onKeydown" />
    <ul v-if="open && query.trim().length >= 2" class="suggestions" role="listbox">
      <li v-for="(m, i) in matches" :key="m.person.personId" role="option"
          :aria-disabled="!!m.disabled" :aria-selected="i === highlighted"
          :class="{ highlighted: i === highlighted, disabled: m.disabled }" @mousedown.prevent="choose(m)">
        <span class="name">{{ m.person.fullName }}<span v-if="m.reason" class="reason">{{ m.reason }}</span></span>
        <span class="meta">{{ meta ? meta(m.person) : defaultMeta(m.person) }}</span>
      </li>
      <li v-if="!matches.length" class="none">No volunteer matches that name.</li>
    </ul>
  </div>
</template>

<style scoped>
.volunteer-search { position: relative; display: flex; flex-direction: column; gap: 0.25rem; }
.label { font-size: 0.85rem; font-weight: 600; color: var(--color-text-dim); }
.suggestions { position: absolute; top: 100%; left: 0; right: 0; z-index: 5; margin: 0.25rem 0 0; padding: 0; list-style: none;
  background: var(--color-background-darkest); border: 1px solid var(--color-border-default); border-radius: 4px;
  box-shadow: var(--box-shadow-card); max-height: 18rem; overflow-y: auto; }
.suggestions li { display: flex; justify-content: space-between; gap: 0.75rem; padding: 0.5rem 0.75rem; cursor: pointer; }
.suggestions li.highlighted, .suggestions li:hover { background: var(--color-bg-hover); }
.suggestions li.disabled { cursor: default; color: var(--color-text-dim); }
.suggestions .meta { color: var(--color-text-dim); font-size: 0.8rem; white-space: nowrap; }
.suggestions .reason { display: block; font-size: 0.8rem; color: var(--color-text-error); }
.suggestions .none { color: var(--color-text-dim); cursor: default; }
</style>
