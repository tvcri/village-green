<script setup>
import { computed, ref, watch } from 'vue'
import Splitter from 'primevue/splitter'
import SplitterPanel from 'primevue/splitterpanel'
import OperationTable from './OperationTable.vue'
import TryItPanel from './TryItPanel.vue'
import ResponsePanel from './ResponsePanel.vue'
import { apiCall, getApiSpec, getUrlForOperation } from '../../../shared/api/apiClient.js'
import { useAsyncState } from '../../../shared/composables/useAsyncState.js'
import { buildOperationRows } from '../lib/operationRows.js'
import { buildDescriptors } from '../lib/paramModel.js'
import { initialValues, toParams } from '../lib/paramValues.js'
import { metaFromError, metaFromResponse } from '../lib/responseMeta.js'

const selectedOperationId = ref('')

const rows = computed(() => {
  const spec = getApiSpec()
  return spec ? buildOperationRows(spec.operationMap) : []
})

function onSelect(operationId) {
  selectedOperationId.value = operationId
}

const paramValues = ref({})

const selectedOp = computed(() => {
  const spec = getApiSpec()
  return selectedOperationId.value ? spec?.operationMap.get(selectedOperationId.value) : null
})

const descriptors = computed(() =>
  selectedOp.value ? buildDescriptors(selectedOp.value.params) : []
)

// Reset the form whenever the selected operation changes.
watch(descriptors, next => { paramValues.value = initialValues(next) })

const requestParams = computed(() => toParams(descriptors.value, paramValues.value))

// getUrl throws while a required path param is blank — the normal state right
// after selecting an op — and its message is already user-facing.
const resolvedUrl = computed(() => {
  if (!selectedOperationId.value) return { url: '', hint: '' }
  try {
    return { url: getUrlForOperation(selectedOperationId.value, requestParams.value), hint: '' }
  }
  catch (err) {
    return { url: '', hint: err.message }
  }
})

// Which operationId the in-flight (or most recently settled) request
// belongs to. useAsyncState's generation counter only guards a NEWER
// execute() call from a stale one — it does nothing when the selection
// changes without a new execute(), so a request for A left running while the
// user switches to B still resolves and would otherwise write A's result (and
// A's loading state) under B. Stamping identity here, and gating both the
// result and isLoading on it below, keeps the fix local to this feature
// instead of touching the shared composable.
const inFlightOperationId = ref(null)

const { state: result, isLoading, execute } = useAsyncState(
  async () => {
    const requestOperationId = selectedOperationId.value
    inFlightOperationId.value = requestOperationId
    const t0 = performance.now()
    try {
      const res = await apiCall(
        requestOperationId,
        requestParams.value,
        undefined,
        { responseType: 'response' },
      )
      const text = await res.text()
      return metaFromResponse(res, text, performance.now() - t0, requestOperationId)
    }
    catch (err) {
      // The privacy-ack modal owns this one; swallowing it would render a dead
      // result behind a modal that has already unmounted the router-view.
      if (err?.name === 'PrivacyAckError') throw err
      // Everything else — 403, 404, 500 — is a RESULT, not an error.
      return metaFromError(err, performance.now() - t0, requestOperationId)
    }
  },
  { immediate: false, onError: null },
)

// A response for an operation the user has since switched away from is
// discarded rather than displayed — it's stale, not just old.
const resultForSelection = computed(() => {
  const r = result.value
  if (!r) return null
  return r.forOperationId === selectedOperationId.value ? r : null
})

// The spinner must only appear to belong to the currently-selected
// operation. isLoading alone would keep spinning for the OLD operation's
// still-in-flight request after the user has switched to a new one that was
// never executed.
const isLoadingForSelection = computed(
  () => isLoading.value && inFlightOperationId.value === selectedOperationId.value
)

// Clear a stale response when the selection changes.
watch(selectedOperationId, () => { result.value = null })
</script>

<template>
  <div class="api-browser">
    <Splitter class="browser-split" state-key="vg-apibrowser-splitter-h" state-storage="local">
      <SplitterPanel class="split-panel" :size="55" :min-size="25">
        <div class="request-column">
          <OperationTable
            class="op-table"
            :rows="rows"
            :selected-operation-id="selectedOperationId"
            @select="onSelect"
          />
          <TryItPanel
            v-if="selectedOperationId"
            class="tryit-form"
            :operation-id="selectedOperationId"
            :descriptors="descriptors"
            :values="paramValues"
            :resolved="resolvedUrl"
            :is-loading="isLoadingForSelection"
            @update:values="paramValues = $event"
            @execute="execute"
          />
        </div>
      </SplitterPanel>
      <SplitterPanel class="split-panel" :size="45" :min-size="25">
        <div class="response-column">
          <ResponsePanel
            :result="resultForSelection"
            :is-loading="isLoadingForSelection"
            :operation-id="selectedOperationId"
          />
        </div>
      </SplitterPanel>
    </Splitter>
  </div>
</template>

<style scoped>
.api-browser {
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  /* Viewport-bounded so the Splitter (and scrollHeight="flex") have a height to
     fill. 115px = app header (70px) + breadcrumbs (~45px); .app-main itself has
     no height bound. Matches SqlConsole. */
  height: calc(100dvh - 115px);
  box-sizing: border-box;
}
.browser-split {
  flex: 1 1 auto;
  min-height: 0;
}
/* PrimeVue Splitter is only flexbox: it sets flex-basis but no containment.
   Flex items default to min-width/height:auto (won't shrink below intrinsic
   content size), so a long path or a deep JSON tree blows the pane past the
   viewport. Force containment on every splitter AND panel in the chain. */
.browser-split :deep(.p-splitter),
.browser-split :deep(.p-splitterpanel) {
  min-width: 0;
  min-height: 0;
}
.split-panel {
  overflow: hidden;
}
.request-column,
.response-column {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0.75rem;
}
/* The table absorbs the remainder; the form (added in Task 5) is content-sized
   so the split rebalances automatically as the selected op's field count
   changes (0 fields for 14 of 47 GETs, 9 for getFriends). */
.op-table {
  flex: 1 1 auto;
  min-height: 0;
}
/* Content-sized so the split rebalances automatically as field count changes;
   capped + scrollable so a 9-param form can't squeeze the table to nothing. */
.tryit-form {
  flex: 0 0 auto;
  max-height: 45%;
  overflow-y: auto;
}
</style>
