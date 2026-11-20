<script setup>
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import Button from 'primevue/button'
import ResolvePersonPanel from './ResolvePersonPanel.vue'
import { actionsFor, fieldLabel, formatValue, sentenceFor } from '../lib/holdReasons.js'
import { lglConstituentUrl } from '../../../shared/lib/lgl.js'

// One hold, in staff terms. `act(action, payload)` performs an action and
// rejects with the API's error; the parent reloads on success.
const props = defineProps({
  hold: { type: Object, required: true },
  canWrite: { type: Boolean, default: false },
  act: { type: Function, required: true },
})

const personById = computed(() => new Map((props.hold.persons ?? []).map(p => [p.personId, p])))
const userById = computed(() => new Map((props.hold.users ?? []).map(u => [u.userId, u])))
const unlinked = computed(() => props.hold.personId == null)
const person = computed(() => personById.value.get(props.hold.personId) ?? null)
const lgl = computed(() => (unlinked.value ? props.hold.detail?.lgl : null) ?? null)
const donorName = computed(() => lgl.value?.name || `LGL donor ${props.hold.lglConstituentId}`)
const donorLines = computed(() => {
  const l = lgl.value
  if (!l) return []
  return [l.email, l.address, l.lastGiftDate ? `last gift ${l.lastGiftDate}` : null].filter(Boolean)
})
const candidates = computed(() => (props.hold.detail?.candidates ?? [])
  .map(id => personById.value.get(String(id))).filter(Boolean))
const missingCandidates = computed(() => (props.hold.detail?.candidates ?? []).length - candidates.value.length)

const showValues = computed(() => !unlinked.value && props.hold.detail &&
  ('vg' in props.hold.detail || 'lgl' in props.hold.detail))
const vgValue = computed(() => formatValue(props.hold.field, props.hold.detail?.vg))
const lglValue = computed(() => formatValue(props.hold.field, props.hold.detail?.lgl))

const pendingTarget = computed(() => {
  const r = props.hold.resolution
  if (props.hold.state !== 'open' || !r) return null
  if (r.kind === 'create') return 'will add them as a new person'
  return `will link to ${personById.value.get(String(r.personId))?.displayName ?? `person ${r.personId}`}`
})

const fmtWhen = (iso) => iso ? new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : ''
// Who set a hold aside. The sync's own dismissals and the import review's
// skips are made under the sync's service account; staff should not read
// that account's name as a colleague's.
const setAside = computed(() => {
  const h = props.hold
  if (h.reason === 'import-skip') return 'Skipped at the import review'
  if (h.dismissalKind === 'rule') return 'Set aside by the sync'
  return `Marked as seen by ${whoDid(h.dismissedUserId, 'a staff member')}`
})
const whoDid = (userId, fallback) => userId == null ? fallback : (userById.value.get(userId)?.displayName ?? 'a staff member')

const actions = computed(() => props.canWrite ? actionsFor(props.hold) : [])

const picking = ref(false)
const confirming = ref(false)
const busy = ref(false)
const error = ref(null)

async function run (action, payload) {
  busy.value = true
  error.value = null
  try {
    await props.act(action, payload)
    picking.value = false
    confirming.value = false
  }
  catch (err) {
    error.value = err?.body?.detail || 'That did not work. Reload and try again.'
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="row" :data-hold="hold.holdId">
    <div class="who">
      <template v-if="!unlinked">
        <RouterLink v-if="person" :to="{ name: 'meta-person-detail', params: { personId: person.personId } }" class="person-link">
          {{ person.fullName }}
        </RouterLink>
        <span v-else class="gone">Person no longer in VG</span>
      </template>
      <template v-else>
        <span class="label">LGL donor</span>
        <strong v-if="lgl?.name">{{ lgl.name }}</strong>
        <strong v-else>{{ donorName }}</strong>
        <span v-for="line in donorLines" :key="line" class="sub">{{ line }}</span>
      </template>
    </div>

    <div class="situation">
      <span v-if="hold.field" class="label">{{ fieldLabel(hold.field) }}</span>
      <p v-if="pendingTarget" class="say">
        <span class="pill wait">Waiting for the next sync run</span> <span>{{ pendingTarget }}</span>
      </p>
      <p class="say">
        <span v-if="hold.reason === 'resolution-failed'" class="pill fail">Couldn’t link</span>
        {{ sentenceFor(hold) }}
      </p>
      <dl v-if="showValues" class="values">
        <dt>VG</dt><dd :class="{ blank: !vgValue }">{{ vgValue ?? '(empty)' }}</dd>
        <dt>LGL</dt><dd :class="{ blank: !lglValue }">{{ lglValue ?? '(empty)' }}</dd>
      </dl>
      <template v-if="unlinked && hold.state !== 'closed' && (candidates.length || missingCandidates)">
        <span class="label">Might be</span>
        <ul class="cands">
          <li v-for="c in candidates" :key="c.personId">
            <RouterLink :to="{ name: 'meta-person-detail', params: { personId: c.personId } }">{{ c.fullName }}</RouterLink>
          </li>
          <li v-if="missingCandidates" class="gone">Person no longer in VG</li>
        </ul>
      </template>
      <p v-if="hold.state === 'dismissed'" class="say">
        <span class="pill seen">{{ setAside }}</span>
        {{ fmtWhen(hold.dismissedAt) }}
      </p>
      <p v-if="hold.state === 'closed'" class="say">
        <span class="pill done">Closed</span>
        by {{ whoDid(hold.closedUserId, 'the sync') }}, {{ fmtWhen(hold.closedAt) }}
      </p>
      <p v-if="error && !picking" class="error" role="alert">{{ error }}</p>
    </div>

    <div class="actions">
      <Button v-if="actions.includes('link')" :label="hold.resolution ? 'Change' : 'This is…'"
 size="small" :disabled="busy" @click="picking = true; confirming = false; error = null" />
      <Button v-if="actions.includes('create')" label="New person" size="small" outlined :disabled="busy"
        @click="run('create')" />
      <Button v-if="actions.includes('dontAdd')" label="Don’t add this donor" size="small" severity="secondary" outlined
        :disabled="busy" @click="confirming = true; picking = false" />
      <Button v-if="actions.includes('seen')" label="Mark as seen" size="small" severity="secondary" outlined
        :disabled="busy" @click="run('seen')" />
      <Button v-if="actions.includes('doneInLgl')" label="Done in LGL" size="small" :disabled="busy"
        @click="run('doneInLgl')" />
      <a :href="lglConstituentUrl(hold.lglConstituentId)" target="_blank" rel="noopener" class="lgl-link">Open in LGL</a>
    </div>

    <div v-if="confirming" class="confirm" role="group" aria-label="Confirm">
      <p><strong>Don’t add {{ donorName }} to VG?</strong> The sync will stop trying to match this donor.
        You can undo this later under Marked as seen.</p>
      <div class="bar">
        <Button label="Don’t add" severity="danger" size="small" :disabled="busy" @click="run('dontAdd')" />
        <Button label="Cancel" severity="secondary" text size="small" @click="confirming = false" />
      </div>
    </div>

    <ResolvePersonPanel v-if="picking" :donor-name="donorName" :candidates="candidates" :error="error" :busy="busy"
      @choose="(p) => run('link', p)" @cancel="picking = false; error = null" />
  </div>
</template>

<style scoped>
.row {
  border-top: 1px solid var(--p-content-border-color);
  padding: 0.75rem 1rem 0.75rem 2.25rem;
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 1.6fr) auto;
  gap: 0.5rem 1.25rem;
  align-items: start;
}
.who, .situation { min-width: 0; display: flex; flex-direction: column; gap: 0.15rem; }
.person-link { font-weight: 600; }
.sub { color: var(--p-text-muted-color); font-size: 0.85rem; overflow-wrap: anywhere; }
.gone { color: var(--p-text-muted-color); font-style: italic; }
.label { font-size: 0.75rem; letter-spacing: 0.05em; text-transform: uppercase; color: var(--p-text-muted-color); font-weight: 600; }
.say { margin: 0 0 0.25rem; }
.values { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 0.1rem 0.75rem; margin: 0; }
.values dt { font-weight: 600; color: var(--p-text-muted-color); font-size: 0.8rem; }
.values dd { margin: 0; overflow-wrap: anywhere; }
.values dd.blank { color: var(--p-text-muted-color); font-style: italic; }
.cands { list-style: none; margin: 0; padding: 0; }
.actions { display: flex; flex-wrap: wrap; gap: 0.4rem; justify-content: flex-end; align-items: center; }
.lgl-link { font-size: 0.85rem; white-space: nowrap; }
.pill { display: inline-block; border-radius: 4px; padding: 0.1rem 0.5rem; font-size: 0.85rem; }
.pill.wait { background: var(--hold-wait-bg); color: var(--hold-wait-fg); }
.pill.fail { background: var(--hold-fail-bg); color: var(--hold-fail-fg); }
.pill.seen { background: var(--p-content-hover-background); color: var(--p-text-muted-color); }
.pill.done { background: var(--hold-done-bg); color: var(--hold-done-fg); }
.error { color: var(--hold-error-fg); margin: 0; }
.confirm {
  grid-column: 1 / -1;
  background: var(--p-content-hover-background);
  border: 1px solid var(--p-content-border-color);
  border-radius: 6px;
  padding: 0.75rem;
}
.confirm p { margin: 0 0 0.5rem; }
.bar { display: flex; gap: 0.5rem; }
@media (max-width: 760px) {
  .row { grid-template-columns: minmax(0, 1fr); padding-left: 1rem; }
  .actions { justify-content: flex-start; }
}
</style>
