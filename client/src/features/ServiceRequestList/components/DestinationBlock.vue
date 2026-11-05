<script setup>
import { computed } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import { stateOptions } from '../lib/destinations.js'

// One destination on the request form. It holds no state of its own: the parent
// owns the list and hears about every change.

defineOptions({ name: 'DestinationBlock' })

const props = defineProps({
  modelValue: { type: Object, required: true },
  index: { type: Number, required: true },
  total: { type: Number, required: true },
  isRide: { type: Boolean, default: false },
  homeDisabled: { type: Boolean, default: false }
})

const emit = defineEmits(['update:modelValue', 'remove', 'lookup', 'use-home', 'clear'])

const title = computed(() => props.total === 1 ? 'Destination' : `Destination ${props.index + 1}`)

// "Destination 2" becomes "destination 2" inside the button labels below, so a
// screen reader can tell one block's buttons from another's.
const titleInSentence = computed(() => title.value.toLowerCase())

// A prop must not be written to from the child, so an edit sends the parent a
// whole new object and the parent puts it in the list. The new value then comes
// back down through modelValue.
function setField (field, value) {
  emit('update:modelValue', { ...props.modelValue, [field]: value })
}
</script>

<template>
  <div class="destination-block">
    <div class="destination-header">
      <h3 style="margin: 0; font-size: 0.95rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--p-primary-600);">{{ title }}</h3>
      <!-- The lookup is about the destination, not the ride: every service with
           a destination gets it, and so does Clear fields — a lookup that can
           fill has to be undoable. "Use member's home" stays Rides-only: an
           Errand's destination is a shop, not the member's house. -->
      <div style="display: flex; gap: 0.5rem;">
        <Button v-if="isRide" type="button" class="use-home-btn" size="small" outlined label="Use member's home" :disabled="homeDisabled" @click="emit('use-home')" />
        <Button type="button" size="small" outlined icon="pi pi-search" label="Look up…" :aria-label="`Look up ${titleInSentence}`" @click="emit('lookup')" />
        <Button type="button" size="small" text severity="secondary" label="Clear fields" :aria-label="`Clear ${titleInSentence}`" @click="emit('clear')" />
      </div>
      <Button
        v-if="total > 1"
        class="destination-remove"
        type="button"
        icon="pi pi-times"
        size="small"
        text
        severity="secondary"
        aria-label="Remove destination"
        @click="emit('remove')"
      />
    </div>

    <!-- Destination / Address Row -->
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
      <div>
        <label style="display: block; font-weight: 500; margin-bottom: 0.5rem;">Destination<span v-if="isRide" class="req">*</span></label>
        <InputText
          :model-value="modelValue.destination"
          placeholder="Enter destination"
          style="width: 100%;"
          @update:model-value="setField('destination', $event)"
        />
      </div>

      <div>
        <label style="display: block; font-weight: 500; margin-bottom: 0.5rem;">Address</label>
        <InputText
          :model-value="modelValue.address"
          placeholder="Enter address"
          style="width: 100%;"
          @update:model-value="setField('address', $event)"
        />
      </div>
    </div>

    <!-- City / State / Zip / Phone Row -->
    <div style="display: grid; grid-template-columns: 2fr 1fr 1fr 1.5fr; gap: 1rem;">
      <div>
        <label style="display: block; font-weight: 500; margin-bottom: 0.5rem;">City</label>
        <InputText
          :model-value="modelValue.city"
          placeholder="City"
          style="width: 100%;"
          @update:model-value="setField('city', $event)"
        />
      </div>

      <div>
        <label style="display: block; font-weight: 500; margin-bottom: 0.5rem;">State</label>
        <Select
          :model-value="modelValue.state"
          :options="stateOptions.map(s => ({ label: s, value: s }))"
          option-label="label"
          option-value="value"
          placeholder="State"
          style="width: 100%;"
          @update:model-value="setField('state', $event)"
        />
      </div>

      <div>
        <label style="display: block; font-weight: 500; margin-bottom: 0.5rem;">Zip</label>
        <InputText
          :model-value="modelValue.zip"
          placeholder="Zip"
          style="width: 100%;"
          @update:model-value="setField('zip', $event)"
        />
      </div>

      <div>
        <label style="display: block; font-weight: 500; margin-bottom: 0.5rem;">Phone</label>
        <InputText
          :model-value="modelValue.phone"
          placeholder="Phone"
          style="width: 100%;"
          @update:model-value="setField('phone', $event)"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Same spacing the fields had as direct children of the form. */
.destination-block {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.destination-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 1rem;
  border-bottom: 2px solid var(--color-border-default);
  margin-bottom: 0.5rem;
  padding-bottom: 0.75rem;
}

.destination-remove {
  margin-left: auto;
}

/* These two repeat ServiceRequestCreateEdit's rules: a scoped style does not
   reach into a child component, and these buttons and labels now live here. */
.req {
  color: var(--color-text-error);
  margin-left: 0.15rem;
}

.use-home-btn :deep(.p-button-label) {
  font-weight: 700;
}
</style>
