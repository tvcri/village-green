// Download (CSV) and Create Google Sheet handlers for an <ExportButton>, with
// the same toasts PersonList.vue shows. `buildRows` is async and runs on each
// click, so per-export fetches happen only when the user exports.
//
// columns, filename and sheetTitle may be refs or getters (read at click time).
import { ref, computed, toValue } from 'vue'
import { useToast } from 'primevue/usetoast'
import { toCsv, downloadCsv } from '../lib/csvUtils.js'
import { createSheet } from '../services/googleSheetsService.js'

export function useExportActions ({ buildRows, columns, filename, sheetTitle }) {
  const toast = useToast()
  const isFetching = ref(false)
  const isCreatingSheet = ref(false)
  const busy = computed(() => isFetching.value || isCreatingSheet.value)

  async function fetchRows () {
    isFetching.value = true
    try { return await buildRows() }
    finally { isFetching.value = false }
  }

  async function download () {
    try {
      const rows = await fetchRows()
      downloadCsv(toCsv(rows, toValue(columns)), toValue(filename))
    }
    catch (err) {
      toast.add({ severity: 'error', summary: 'Export Failed', detail: err.message, life: 5000 })
    }
  }

  async function exportSheet () {
    isCreatingSheet.value = true
    try {
      const rows = await fetchRows()
      const result = await createSheet(rows, toValue(columns), toValue(sheetTitle))
      const sheetUrl = result.url || result
      if (result.popupBlocked) {
        toast.add({
          severity: 'success',
          summary: 'Sheet Created',
          detail: `Your Google Sheet has been created. <a href="${sheetUrl}" target="_blank" style="color: inherit; text-decoration: underline;">Open it here</a>.`,
          life: 0,
          contentStyleClass: 'bg-green-50 border-green-200',
        })
      }
      else {
        toast.add({ severity: 'success', summary: 'Sheet Created', detail: 'Your Google Sheet has been created and opened in a new tab.', life: 3000 })
      }
    }
    catch (err) {
      let message
      if (err.message.includes('Popup was blocked')) message = 'Please allow popups for this site to use Google Sheets export'
      else if (err.message.includes('timeout')) message = 'Sheet creation timed out. Please try again.'
      else message = `Error: ${err.message}`
      toast.add({ severity: 'error', summary: 'Sheet Creation Failed', detail: message, life: 5000 })
    }
    finally {
      isCreatingSheet.value = false
    }
  }

  return { busy, download, exportSheet }
}
