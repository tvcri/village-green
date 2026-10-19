<script setup>
import { computed, ref, onMounted } from 'vue'
import SplitButton from 'primevue/splitbutton'
import { useAnalytics } from '../shared/composables/useAnalytics.js'

const props = defineProps({
  disabled: Boolean,
  // Where "Download" alone is ambiguous (e.g. beside a PDF preview), name the format.
  label: { type: String, default: 'Download' }
})

const emit = defineEmits(['download', 'export'])
const { trackEvent } = useAnalytics()

const isMobile = ref(false)

onMounted(() => {
  isMobile.value = window.innerWidth <= 768
  window.addEventListener('resize', () => {
    isMobile.value = window.innerWidth <= 768
  })
})

const buttonLabel = computed(() => isMobile.value ? '' : props.label)

const menuItems = computed(() => [
  {
    label: 'Create Google Sheet',
    icon: 'pi pi-google',
    command: () => {
      trackEvent('export_google_sheets')
      emit('export')
    }
  }
])
</script>

<template>
  <SplitButton
    :label="buttonLabel"
    icon="pi pi-download"
    @click="() => { trackEvent('export_csv'); emit('download') }"
    :model="menuItems"
    :disabled="disabled"
    class="export-button"
  />
</template>

<style scoped>
.export-button :deep(.p-button-label) {
  min-width: auto;
}
</style>
