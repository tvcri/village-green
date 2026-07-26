import { ref, computed } from 'vue'

// Service names arrive inconsistently punctuated ('Ride: Medical' vs
// 'Ride:Medical'). Normalize case and colon spacing so the dropdown matches
// both. The meta list previously used exact equality and silently missed rows.
const normalizeService = (s) => s?.toLowerCase().replace(/:\s*/g, ': ').trim()

const sortedUnique = (rows, key) =>
  Array.from(new Set((rows ?? []).map(r => r[key]).filter(Boolean))).sort()

// Service options collapse to one entry per normalized name, keeping the first
// spelling seen — otherwise two dropdown entries would select identical rows.
const sortedUniqueServices = (rows) => {
  const seen = new Map()
  for (const r of rows ?? []) {
    if (r.serviceName) {
      const key = normalizeService(r.serviceName)
      if (!seen.has(key)) seen.set(key, r.serviceName)
    }
  }
  return Array.from(seen.values()).sort()
}

/**
 * Shared client-side filtering for the service request lists.
 * @param {import('vue').Ref<Array|null>} rows source rows (null while loading)
 */
export function useServiceRequestFilters (rows) {
  const selectedMember = ref('')
  const selectedVolunteer = ref('')
  const selectedService = ref('')
  const idSearch = ref('')

  const safeRows = computed(() => Array.isArray(rows.value) ? rows.value : [])

  const memberNames = computed(() => sortedUnique(safeRows.value, 'memberFullName'))
  const volunteerNames = computed(() => sortedUnique(safeRows.value, 'volunteerFullName'))
  const serviceNames = computed(() => sortedUniqueServices(safeRows.value))

  const matches = (r) => {
    if (selectedMember.value && r.memberFullName !== selectedMember.value) return false
    if (selectedVolunteer.value && r.volunteerFullName !== selectedVolunteer.value) return false
    if (selectedService.value &&
        normalizeService(r.serviceName) !== normalizeService(selectedService.value)) return false
    const q = idSearch.value.trim().toLowerCase()
    if (q && !String(r.displayNumber ?? '').toLowerCase().includes(q)) return false
    return true
  }

  const filteredRows = computed(() => safeRows.value.filter(matches))

  const clearAll = () => {
    selectedMember.value = ''
    selectedVolunteer.value = ''
    selectedService.value = ''
    idSearch.value = ''
  }

  return {
    selectedMember, selectedVolunteer, selectedService, idSearch,
    memberNames, volunteerNames, serviceNames,
    matches, filteredRows, clearAll
  }
}
