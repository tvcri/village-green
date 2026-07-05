<script setup>
import { ref } from 'vue'
import Button from 'primevue/button'
import Message from 'primevue/message'
import ProgressSpinner from 'primevue/progressspinner'
import { extractApplication } from '../api/applicationImportApi.js'

const emit = defineEmits(['extracted'])

const selectedFile = ref(null)
const status = ref('idle')          // idle | loading | error | unsupported
const errorMessage = ref('')

function onFileChange (event) {
  selectedFile.value = event.target.files[0] ?? null
}

async function submit () {
  status.value = 'loading'
  errorMessage.value = ''
  try {
    const result = await extractApplication(selectedFile.value)
    if (result.applicationType === 'volunteer') {
      status.value = 'unsupported'
      errorMessage.value = 'This looks like a volunteer application. Volunteer imports aren\'t supported yet.'
      return
    }
    if (result.applicationType === 'unknown') {
      status.value = 'unsupported'
      errorMessage.value = `This doesn't appear to be a member application: ${result.reason}`
      return
    }
    emit('extracted', result)
  }
  catch (err) {
    status.value = 'error'
    errorMessage.value = err?.body?.error ?? err?.message ?? 'Extraction failed.'
  }
}

function reset () {
  status.value = 'idle'
  selectedFile.value = null
  errorMessage.value = ''
}
</script>

<template>
  <div v-if="status === 'loading'" class="upload-loading">
    <ProgressSpinner />
    <p>Extracting data from the PDF…</p>
  </div>
  <div v-else>
    <Message v-if="errorMessage" :severity="status === 'error' ? 'error' : 'warn'">{{ errorMessage }}</Message>
    <div class="upload-controls">
      <input type="file" accept=".pdf,application/pdf" @change="onFileChange" />
      <Button label="Extract" :disabled="!selectedFile" @click="submit" />
      <Button v-if="status !== 'idle'" label="Start Over" severity="secondary" @click="reset" />
    </div>
  </div>
</template>

<style scoped>
.upload-loading { text-align: center; padding: 3rem; }
.upload-controls { display: flex; gap: 1rem; align-items: center; margin-top: 1rem; }
</style>
