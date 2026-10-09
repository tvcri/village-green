<script setup>
// One village, circle or Hub group on a position's page (UI spec §5).
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import VolunteerSearch from '../../../shared/components/VolunteerSearch.vue'

const props = defineProps({
  group: { type: Object, required: true },
  showHint: { type: Boolean, default: false },
  hintFor: { type: Function, required: true }, // personId -> { missing: string[], ok: string[] }
  removeIds: { type: Object, required: true }, // Set<volunteerPositionId>
  flashIds: { type: Object, default: () => new Set() }, // rows to flash after a save
  candidates: { type: Array, default: () => [] }, // who the add search offers here
  candidateNote: { type: String, default: '' },
  status: { type: Function, required: true }, // person -> { disabled, reason }
  canWrite: { type: Boolean, default: false },
  open: { type: Boolean, default: false },
  personById: { type: Function, required: true },
})
defineEmits(['toggle', 'select', 'remove', 'undo', 'unadd'])
const empty = () => !props.group.rows.length && !props.group.adds.length
</script>

<template>
  <section :class="['holder-group', { vacant: empty() }]">
    <h3>
      {{ group.label }} <span class="count">{{ empty() ? 'No holders' : group.rows.length }}</span>
      <Button v-if="canWrite" class="add-btn" label="Add" icon="pi pi-plus" size="small" severity="secondary" outlined
              :aria-label="group.villageId || group.circleId ? `Add a holder in ${group.label}` : 'Add a holder'" @click="$emit('toggle')" />
    </h3>
    <template v-if="open">
      <VolunteerSearch :candidates="candidates" :status="status" :label="`Add a volunteer in ${group.label}`"
                       :input-id="`add-${group.key}`" @select="p => $emit('select', p)" />
      <small v-if="candidateNote" class="candidate-note">{{ candidateNote }}</small>
    </template>
    <table v-if="!empty()">
      <tbody>
        <tr v-for="h in group.rows" :key="h.volunteerPositionId" :class="{ removing: removeIds.has(h.volunteerPositionId), flash: flashIds.has(h.volunteerPositionId) }">
          <td class="name">
            {{ h.person.fullName }}
            <span v-if="h.village && h.person.village?.villageId !== h.village.villageId" class="dim">(associate)</span>
          </td>
          <td>{{ h.person.active ? 'Active' : 'Inactive' }}</td>
          <td v-if="showHint && !removeIds.has(h.volunteerPositionId)">
            <span v-for="m in hintFor(h.person.personId).missing" :key="m" class="hint warn">No record of {{ m }}</span>
            <span v-for="o in hintFor(h.person.personId).ok" :key="o" class="hint ok">{{ o }}</span>
          </td>
          <td v-else-if="showHint"></td>
          <td class="state"><span v-if="removeIds.has(h.volunteerPositionId)" class="hint warn">Will be removed</span></td>
          <td class="actions">
            <Button v-if="canWrite && removeIds.has(h.volunteerPositionId)" label="Undo" text size="small" @click="$emit('undo', h.volunteerPositionId)" />
            <Button v-else-if="canWrite" icon="pi pi-trash" text rounded severity="danger"
                    :aria-label="`Remove ${h.person.displayName} from this position`" @click="$emit('remove', h.volunteerPositionId)" />
          </td>
        </tr>
        <tr v-for="a in group.adds" :key="a.key" class="adding">
          <td class="name">{{ personById(a.personId).fullName }}</td>
          <td>{{ personById(a.personId).active ? 'Active' : 'Inactive' }}</td>
          <td v-if="showHint">
            <span v-for="m in hintFor(a.personId).missing" :key="m" class="hint warn">No record of {{ m }}</span>
            <span v-for="o in hintFor(a.personId).ok" :key="o" class="hint ok">{{ o }}</span>
          </td>
          <td class="state"><Tag value="New" severity="info" /></td>
          <td class="actions">
            <Button icon="pi pi-times" text rounded :aria-label="`Don’t add ${personById(a.personId).displayName}`" @click="$emit('unadd', a.key)" />
          </td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<style scoped>
.holder-group { display: flex; flex-direction: column; gap: 0.4rem; }
.candidate-note { color: var(--color-text-dim); font-size: 0.8rem; }
.holder-group.vacant { padding-bottom: 0.4rem; border-bottom: 1px dashed var(--color-border-default); }
h3 { display: flex; align-items: center; gap: 0.5rem; margin: 0; font-size: 1rem; }
.vacant h3 { color: var(--color-text-dim); }
.count { font-weight: 400; font-size: 0.85rem; color: var(--color-text-dim); }
.add-btn { margin-left: auto; }
table { width: 100%; border-collapse: collapse; }
td { padding: 0.35rem 0.5rem; border-bottom: 1px solid var(--color-border-default); }
.name { width: 40%; }
.state { width: 9rem; }
.actions { width: 5rem; text-align: right; }
tr.flash td { animation: flash 2.4s ease-out; }
@keyframes flash { 0%, 40% { box-shadow: inset 0 0 0 999px rgba(250, 204, 21, 0.35); } 100% { box-shadow: none; } }
.removing td { color: var(--color-text-dim); }
.removing .name { text-decoration: line-through; }
.adding td { background: var(--p-primary-50); }
.hint { display: inline-block; font-size: 0.8rem; margin-right: 0.4rem; }
.hint.warn { color: var(--color-text-error); }
.hint.ok { color: var(--color-text-dim); }
.dim { color: var(--color-text-dim); font-size: 0.8rem; }
</style>
