<script setup>
// Admin list pages for the two volunteer catalogs (UI spec §3). One
// component, configured by `kind`; positions add Scope and expected trainings.
import { ref, reactive, computed, onMounted } from 'vue'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import Select from 'primevue/select'
import MultiSelect from 'primevue/multiselect'
import Tag from 'primevue/tag'
import { getTrainings, createTraining, patchTraining, deleteTraining } from '../../Trainings/api/trainingApi.js'
import { getPositions, createPosition, patchPosition, deletePosition } from '../../Positions/api/positionApi.js'
import { scopeLabel } from '../../../shared/lib/positionRules.js'
import { useRequirePermission } from '../../../shared/composables/useRequirePermission.js'

const props = defineProps({ kind: { type: String, required: true } }) // 'training' | 'position'

const CONFIG = {
  training: {
    title: 'Trainings', singular: 'training', idKey: 'trainingId', countHeader: 'Volunteers', hasScope: false,
    subtitle: 'The trainings volunteers can complete. Staff record completions from Hub › Constituents › Trainings.',
    create: createTraining, patch: patchTraining, remove: deleteTraining,
  },
  position: {
    title: 'Positions', singular: 'position', idKey: 'positionId', countHeader: 'Holders', hasScope: true,
    subtitle: 'Positions record what volunteers do in the organization. They don’t grant access to Village Green; access comes from roles, under Users.',
    create: createPosition, patch: patchPosition, remove: deletePosition,
  },
}
const cfg = computed(() => CONFIG[props.kind])
useRequirePermission(`${props.kind}:admin`)

const confirm = useConfirm()
const toast = useToast()
const trainings = ref([])
const positions = ref([])
const rows = computed(() => [...(props.kind === 'training' ? trainings.value : positions.value)]
  .sort((a, b) => a.name.localeCompare(b.name)))
const trainingName = (id) => trainings.value.find(t => t.trainingId === id)?.name
const positionsExpecting = (trainingId) => positions.value.filter(p => p.trainingIds.includes(trainingId))
const scopeOptions = ['federation', 'village', 'circle'].map(v => ({ value: v, label: scopeLabel(v) }))
const trainingOptions = computed(() => [...trainings.value].sort((a, b) => a.name.localeCompare(b.name)))
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`

async function load () {
  const [t, p] = await Promise.all([getTrainings(), getPositions()])
  trainings.value = t
  positions.value = p
}
onMounted(() => load().catch(() =>
  toast.add({ severity: 'error', summary: 'Error', detail: `Failed to load ${cfg.value.title.toLowerCase()}`, life: 3000 })))

// ---- add / edit dialog ----
const dialogOpen = ref(false)
const editing = ref(null) // the row being edited, or null when adding
const form = reactive({ name: '', description: '', scope: null, trainingIds: [] })
const nameError = ref('')
const formError = ref('')
const held = computed(() => (editing.value?.holderCount ?? 0) > 0)

function openDialog (row) {
  editing.value = row
  form.name = row?.name ?? ''
  form.description = row?.description ?? ''
  form.scope = row?.scope ?? null
  form.trainingIds = [...(row?.trainingIds ?? [])]
  nameError.value = ''
  formError.value = ''
  dialogOpen.value = true
}

async function saveDialog () {
  nameError.value = ''
  formError.value = ''
  const name = form.name.trim()
  if (!name) { nameError.value = 'Name is required.'; return }
  if (cfg.value.hasScope && !form.scope) { formError.value = 'Choose a scope.'; return }
  const body = { name, description: form.description.trim() || null }
  if (cfg.value.hasScope) {
    body.trainingIds = form.trainingIds
    // Send scope only when it can change and did: a held position's scope is
    // frozen (409), and an unchanged scope is noise in the audit trail.
    if (!editing.value || (!held.value && form.scope !== editing.value.scope)) body.scope = form.scope
  }
  try {
    if (editing.value) await cfg.value.patch(editing.value[cfg.value.idKey], body)
    else await cfg.value.create(body)
    dialogOpen.value = false
    toast.add({ severity: 'success', summary: 'Saved', detail: `${editing.value ? 'Saved' : 'Added'} ${name}`, life: 2000 })
    await load()
  }
  catch (err) {
    const message = err?.body?.error ?? 'Save failed.'
    if (err?.status === 409 && /already exists/.test(message)) nameError.value = message
    else formError.value = message
  }
}

// ---- delete ----
function deleteReason (row) {
  return row.holderCount > 0
    ? `Held by ${plural(row.holderCount, 'volunteer')}. Remove it from their records first.`
    : `Delete ${row.name}`
}

function askDelete (row) {
  const linked = props.kind === 'training' ? positionsExpecting(row.trainingId).map(p => p.name) : []
  const tail = linked.length
    ? ` It will also be removed from the expected trainings of ${linked.join(' and ')}.`
    : ' No volunteer has it, so nothing else changes.'
  confirm.require({
    header: `Delete ${cfg.value.singular}?`,
    message: `Delete ${row.name}?${tail}`,
    acceptLabel: 'Delete',
    rejectLabel: 'Cancel',
    acceptProps: { severity: 'danger' },
    rejectProps: { severity: 'secondary' },
    accept: async () => {
      try {
        await cfg.value.remove(row[cfg.value.idKey])
        toast.add({ severity: 'success', summary: 'Deleted', detail: `Deleted ${row.name}`, life: 2000 })
      }
      catch (err) {
        toast.add({ severity: 'error', summary: 'Not deleted', detail: err?.body?.error ?? 'Delete failed.', life: 4000 })
      }
      await load()
    },
  })
}
</script>

<template>
  <div class="catalog-admin">
    <h1>{{ cfg.title }}</h1>
    <p class="subtitle">{{ cfg.subtitle }}</p>
    <div class="toolbar">
      <Button :label="`Add ${cfg.singular}`" icon="pi pi-plus" @click="openDialog(null)" />
    </div>

    <DataTable :value="rows" size="small" :dataKey="cfg.idKey">
      <Column field="name" header="Name" />
      <Column v-if="cfg.hasScope" header="Scope">
        <template #body="{ data }"><Tag :value="scopeLabel(data.scope)" severity="secondary" /></template>
      </Column>
      <Column header="Description">
        <template #body="{ data }"><span class="dim">{{ data.description || '—' }}</span></template>
      </Column>
      <Column :header="cfg.hasScope ? 'Expected trainings' : 'Expected for'">
        <template #body="{ data }">
          <template v-if="cfg.hasScope">
            <Tag v-for="id in data.trainingIds" :key="id" :value="trainingName(id)" severity="secondary" class="chip" />
            <span v-if="!data.trainingIds.length" class="dim">—</span>
          </template>
          <template v-else>
            <Tag v-for="p in positionsExpecting(data.trainingId)" :key="p.positionId" :value="p.name" severity="secondary" class="chip" />
            <span v-if="!positionsExpecting(data.trainingId).length" class="dim">—</span>
          </template>
        </template>
      </Column>
      <Column :header="cfg.countHeader" field="holderCount" class="num" />
      <Column header="">
        <template #body="{ data }">
          <div class="row-actions">
            <Button icon="pi pi-pencil" text rounded :aria-label="`Edit ${data.name}`" @click="openDialog(data)" />
            <span v-tooltip.top="deleteReason(data)">
              <Button icon="pi pi-trash" text rounded severity="danger" :aria-label="`Delete ${data.name}`"
                      :disabled="data.holderCount > 0" @click="askDelete(data)" />
            </span>
          </div>
        </template>
      </Column>
      <template #empty>No {{ cfg.title.toLowerCase() }} yet. Add the first one.</template>
    </DataTable>

    <Dialog v-model:visible="dialogOpen" modal :header="editing ? `Edit ${cfg.singular}` : `Add ${cfg.singular}`" :style="{ width: '32rem' }">
      <form class="dialog-body" @submit.prevent="saveDialog">
        <div class="field">
          <label for="catalog-name">Name</label>
          <InputText id="catalog-name" v-model="form.name" maxlength="100" :invalid="!!nameError" />
          <small v-if="nameError" class="error">{{ nameError }}</small>
        </div>
        <p v-if="held" class="note">
          {{ plural(editing.holderCount, 'volunteer') }} {{ editing.holderCount === 1 ? 'has' : 'have' }} this {{ cfg.singular }}.
          A new name appears on every one of their records.
        </p>
        <div v-if="cfg.hasScope" class="field">
          <label for="catalog-scope">Scope</label>
          <Select id="catalog-scope" v-model="form.scope" :options="scopeOptions" optionLabel="label" optionValue="value"
                  placeholder="Select scope" :disabled="held" />
          <small class="help">
            {{ held
              ? `Scope can’t change while ${plural(editing.holderCount, 'volunteer')} ${editing.holderCount === 1 ? 'holds' : 'hold'} this position.`
              : 'Hub: held for TVCRI as a whole. Village: held in one village. Circle: held in one circle.' }}
          </small>
        </div>
        <div v-if="cfg.hasScope" class="field">
          <label for="catalog-trainings">Trainings expected before assignment (optional)</label>
          <MultiSelect id="catalog-trainings" v-model="form.trainingIds" :options="trainingOptions"
                       optionLabel="name" optionValue="trainingId" display="chip" placeholder="None" />
          <small class="help">
            Village Green never blocks an assignment. When someone without these trainings is assigned, staff see a
            reminder, and recording one of these trainings offers to assign this position. Volunteer Training is best
            left off, since every active volunteer has it.
          </small>
        </div>
        <div class="field">
          <label for="catalog-description">Description (optional)</label>
          <Textarea id="catalog-description" v-model="form.description" rows="2" maxlength="255" />
          <small class="help counter">{{ form.description.length }} / 255</small>
        </div>
        <small v-if="formError" class="error">{{ formError }}</small>
        <div class="dialog-footer">
          <Button type="button" label="Cancel" severity="secondary" @click="dialogOpen = false" />
          <Button type="submit" :label="editing ? 'Save' : 'Add'" />
        </div>
      </form>
    </Dialog>
  </div>
</template>

<style scoped>
.catalog-admin { padding: 2rem; max-width: 960px; margin: 0 auto; }
h1 { margin: 0 0 0.25rem; color: var(--color-text-primary); }
.subtitle { margin: 0 0 1rem; color: var(--color-text-dim); max-width: 65ch; line-height: 1.5; }
.toolbar { display: flex; justify-content: flex-end; margin-bottom: 0.5rem; }
.dim { color: var(--color-text-dim); }
.chip { margin: 0.1rem 0.25rem 0.1rem 0; }
.row-actions { display: flex; justify-content: flex-end; }
:deep(.num) { text-align: right; font-variant-numeric: tabular-nums; }
.dialog-body { display: flex; flex-direction: column; gap: 1rem; }
.field { display: flex; flex-direction: column; gap: 0.3rem; }
.field label { font-size: 0.85rem; font-weight: 600; color: var(--color-text-dim); }
.help { color: var(--color-text-dim); line-height: 1.4; }
.counter { align-self: flex-end; }
.note { margin: 0; padding: 0.5rem 0.75rem; border: 1px solid var(--color-border-default); border-radius: 4px; background: var(--color-background-light); }
.error { color: var(--color-text-error); }
.dialog-footer { display: flex; justify-content: flex-end; gap: 0.5rem; }
@media (max-width: 600px) { .catalog-admin { padding: 1rem; } }
</style>
