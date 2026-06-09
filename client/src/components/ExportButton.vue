<script setup>
import { computed, ref, onMounted } from 'vue'
import SplitButton from 'primevue/splitbutton'

defineProps({
  disabled: Boolean
})

const emit = defineEmits(['download', 'export'])

const isMobile = ref(false)

onMounted(() => {
  isMobile.value = window.innerWidth <= 768
  window.addEventListener('resize', () => {
    isMobile.value = window.innerWidth <= 768
  })
})

const buttonLabel = computed(() => isMobile.value ? '' : 'Download')

const menuItems = computed(() => [
  {
    label: 'Create Google Sheet',
    icon: 'pi pi-google',
    command: () => {
      emit('export')
    }
  }
])
</script>

<template>
  <SplitButton
    :label="buttonLabel"
    icon="pi pi-download"
    @click="emit('download')"
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
