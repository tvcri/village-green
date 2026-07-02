<script setup>
import { ref, onMounted, computed } from 'vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import Textarea from 'primevue/textarea'
import { useToast } from 'primevue/usetoast'
import { marked } from 'marked'
import { getPrivacyRules, publishPrivacyRules, patchPrivacyRulesCurrent } from '../api/privacyApi.js'

const toast = useToast()
const currentRules = ref(null)
const draftContent = ref('')
const loading = ref(false)
const publishing = ref(false)
const saving = ref(false)
const previewVisible = ref(false)

const savedContent = ref('')
const isDirty = computed(() => draftContent.value !== savedContent.value)

const draftHtml = computed(() =>
  draftContent.value ? marked.parse(draftContent.value) : ''
)

onMounted(async () => {
  await loadRules()
})

async function loadRules() {
  loading.value = true
  try {
    currentRules.value = await getPrivacyRules()
    draftContent.value = currentRules.value?.content ?? ''
    savedContent.value = draftContent.value
  }
  catch (err) {
    if (err?.status !== 404) {
      toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to load privacy rules', life: 4000 })
    }
  }
  finally {
    loading.value = false
  }
}

async function publish() {
  if (!draftContent.value.trim()) return
  publishing.value = true
  try {
    currentRules.value = await publishPrivacyRules(draftContent.value)
    savedContent.value = draftContent.value
    toast.add({ severity: 'success', summary: 'Published', detail: 'New privacy rules version published. All users will be re-prompted.', life: 5000 })
  }
  catch (err) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to publish rules', life: 4000 })
  }
  finally {
    publishing.value = false
  }
}

async function saveCorrections() {
  if (!draftContent.value.trim()) return
  saving.value = true
  try {
    currentRules.value = await patchPrivacyRulesCurrent(draftContent.value)
    savedContent.value = draftContent.value
    toast.add({ severity: 'success', summary: 'Saved', detail: 'Rules corrected. Existing acknowledgements remain valid.', life: 5000 })
  }
  catch (err) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to save corrections', life: 4000 })
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="privacy-admin">
    <h1>Privacy Agreement</h1>

    <div v-if="loading">Loading…</div>

    <template v-else>
      <p v-if="currentRules" class="meta">
        Current version published {{ currentRules.publishedAt }}
        <span v-if="currentRules.modifiedAt"> · Last corrected {{ currentRules.modifiedAt }}</span>
      </p>
      <p v-else class="no-rules">No privacy rules have been published yet.</p>

      <section class="draft-section">
        <h2>Editor</h2>
        <p class="draft-hint">Edit the content below. "Publish" creates a new version and re-prompts all users. "Save corrections" edits the current version in place — existing acknowledgements remain valid.</p>
        <Textarea
          v-model="draftContent"
          :auto-resize="false"
          rows="16"
          style="width: 100%; font-family: monospace; font-size: 0.875rem"
          placeholder="Enter privacy rules in Markdown format…"
        />
        <div class="draft-actions">
          <Button
            label="Preview"
            severity="secondary"
            icon="pi pi-eye"
            :disabled="!draftContent.trim()"
            @click="previewVisible = true"
          />
          <Button
            label="Save corrections"
            severity="secondary"
            :loading="saving"
            :disabled="publishing || saving || !isDirty || !currentRules"
            @click="saveCorrections"
          />
          <Button
            label="Publish"
            :loading="publishing"
            :disabled="publishing || saving || !draftContent.trim()"
            @click="publish"
          />
        </div>
      </section>
    </template>

    <Dialog
      v-model:visible="previewVisible"
      modal
      :close-on-escape="true"
      style="width: 600px; max-width: 95vw"
    >
      <template #header>
        <div class="privacy-header">
          <img src="/tvcri-logo.svg" alt="Village Green Logo" class="privacy-logo" />
          <span>Data Privacy Agreement</span>
        </div>
      </template>
      <div class="privacy-content" v-html="draftHtml" />
      <template #footer>
        <Button label="I Agree" disabled />
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.privacy-admin {
  padding: 2rem;
  max-width: 900px;
  margin: 0 auto;
}

h1 {
  margin: 0 0 1.5rem 0;
  font-size: 2rem;
  color: var(--color-text-primary);
}

h2 {
  font-size: 1.1rem;
  margin: 0 0 0.5rem 0;
  color: var(--color-text-primary);
}

.meta {
  font-size: 0.85rem;
  color: var(--color-text-dim);
  margin: 0 0 1rem 0;
}

.privacy-header {
  display: flex;
  align-items: flex-end;
  gap: 1.75rem;
  font-size: 2rem;
  font-weight: 700;
}

.privacy-logo {
  height: 64px;
  width: auto;
}

.privacy-content {
  max-height: 60vh;
  overflow-y: auto;
  line-height: 1.6;
}

.no-rules {
  color: var(--color-text-dim);
  margin-bottom: 2rem;
}

.draft-section {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.draft-hint {
  font-size: 0.875rem;
  color: var(--color-text-dim);
  margin: 0;
}

.draft-actions {
  display: flex;
  gap: 0.75rem;
  justify-content: flex-end;
}
</style>
