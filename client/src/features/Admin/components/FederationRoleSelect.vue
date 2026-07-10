<script setup>
import { computed } from 'vue'
import Select from 'primevue/select'
import { useRoles } from '../../../shared/composables/useRoles.js'
import { hubSelectionState } from '../lib/grantDisplayHelpers.js'

const props = defineProps({
  hubGrants: { type: Array, required: true },
  disabled: { type: Boolean, default: false },
  error: { type: String, default: '' },
})
const emit = defineEmits(['change'])

// 'none' sentinel: PrimeVue Select shows the placeholder for a null model,
// which we reserve for the multiple-roles state.
const NONE = 'none'

const { federationRoles, getRoleLabel } = useRoles()

const options = computed(() => [
  { name: 'None', value: NONE },
  ...federationRoles.value.map(r => ({ name: r.name, value: String(r.roleId) })),
])

const selection = computed(() => hubSelectionState(props.hubGrants))

const model = computed({
  get: () => selection.value.isMultiple ? null : (selection.value.roleId ?? NONE),
  set: (v) => emit('change', v === NONE ? null : v),
})

const multipleNote = computed(() => {
  if (!selection.value.isMultiple) return ''
  const names = props.hubGrants.map(g => getRoleLabel(g.roleId)).join(', ')
  return `Holds multiple Hub roles: ${names}. Selecting a role (or None) replaces all of them.`
})
</script>

<template>
  <div class="hub-role-field">
    <label for="hub-role-select">Hub role</label>
    <Select
      id="hub-role-select"
      v-model="model"
      :options="options"
      option-label="name"
      option-value="value"
      :placeholder="selection.isMultiple ? 'Multiple roles' : undefined"
      :disabled="disabled"
      class="hub-role-select"
    />
    <small v-if="multipleNote" class="hub-role-note">{{ multipleNote }}</small>
    <small v-if="error" class="field-error">{{ error }}</small>
  </div>
</template>

<style scoped>
.hub-role-field {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.hub-role-field label {
  color: var(--color-text-primary);
  font-weight: 500;
  font-size: 0.95rem;
}

.hub-role-select {
  min-width: 220px;
  max-width: 320px;
}

.hub-role-note {
  color: var(--color-text-dim);
  font-size: 0.8rem;
}

.field-error {
  color: var(--color-text-error);
  font-size: 0.8rem;
}
</style>
