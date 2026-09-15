import { ref, computed } from 'vue'

// Service names arrive inconsistently punctuated ('Ride: Medical' vs
// 'Ride:Medical'). Normalize case and colon spacing so the dropdown matches
// both. The meta list previously used exact equality and silently missed rows.
const normalizeService = (s) => s?.toLowerCase().replace(/:\s*/g, ': ').trim()

// Display order for the status filter label. Mirrors ALL_STATUSES in
// useServiceRequestWindow.js -- duplicated rather than imported to keep this
// composable free of a dependency on the window/fetch composable. An unknown
// key simply drops out of the label.
const STATUS_KEY_ORDER = Object.freeze([
  'open', 'confirmed', 'completed', 'unmatched', 'cancelled'
])

const sortedUnique = (rows, key) =>
  Array.from(new Set((rows ?? []).map(r => r[key]).filter(Boolean))).sort()

// Rows carry the raw DB status ('Open', 'Member cancelled', …) while the
// filter keys are lowercase. 'cancelled' is one key covering three DB values
// (member/volunteer/hub), so it matches on substring the way the previous
// per-component filters did.
const matchesStatus = (rowStatus, key) => {
  const s = (rowStatus ?? '').toLowerCase()
  return key === 'cancelled' ? s.includes('cancelled') : s === key
}

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
 * @param {object} [opts]
 * @param {string[]} [opts.initialStatuses] status keys selected on first render.
 *   The lists seed this with open+confirmed so the default view matches the
 *   work a coordinator acts on. It is a real filter, not a structural default:
 *   clearAll() clears it to [] rather than restoring it.
 */
export function useServiceRequestFilters (rows, { initialStatuses = [] } = {}) {
  const selectedMember = ref('')
  const selectedVolunteer = ref('')
  const selectedService = ref('')
  const idSearch = ref('')
  // [] = no status filter (show every status fetched). Copy the caller's array
  // so a later push here cannot mutate their constant.
  const selectedStatuses = ref([...initialStatuses])

  const safeRows = computed(() => Array.isArray(rows.value) ? rows.value : [])

  const memberNames = computed(() => sortedUnique(safeRows.value, 'memberFullName'))
  const volunteerNames = computed(() => sortedUnique(safeRows.value, 'volunteerFullName'))
  const serviceNames = computed(() => sortedUniqueServices(safeRows.value))

  const matches = (r) => {
    if (selectedStatuses.value.length &&
        !selectedStatuses.value.some(k => matchesStatus(r.status, k))) return false
    if (selectedMember.value && r.memberFullName !== selectedMember.value) return false
    if (selectedVolunteer.value && r.volunteerFullName !== selectedVolunteer.value) return false
    if (selectedService.value &&
        normalizeService(r.serviceName) !== normalizeService(selectedService.value)) return false
    const q = idSearch.value.trim().toLowerCase()
    if (q && !String(r.displayNumber ?? '').toLowerCase().includes(q)) return false
    return true
  }

  const filteredRows = computed(() => safeRows.value.filter(matches))

  // The status checkboxes hide behind the collapsed Filters button, so an empty
  // grid looks unexplained -- the date window and village are still on screen,
  // but the statuses are not. This names them for the empty state. It restates
  // the selection rather than diagnosing a cause: with several filters set, any
  // guess at which one emptied the grid can be wrong, and a confident wrong
  // answer is worse than none. '' when nothing is selected, since [] means "all
  // statuses" and there is nothing to name.
  //
  // Ordered by STATUS_KEY_ORDER, not by selection order: selectedStatuses is a
  // checkbox v-model, so its order follows clicks and the label would otherwise
  // reshuffle as boxes are toggled. 'Cancelled' is one key covering the three
  // DB cancel values -- name it as the user ticked it, not as it is stored.
  const statusFilterLabel = computed(() => STATUS_KEY_ORDER
    .filter(k => selectedStatuses.value.includes(k))
    .map(k => k.charAt(0).toUpperCase() + k.slice(1))
    .join(', '))

  const clearAll = () => {
    selectedMember.value = ''
    selectedVolunteer.value = ''
    selectedService.value = ''
    idSearch.value = ''
    selectedStatuses.value = []
  }

  return {
    selectedMember, selectedVolunteer, selectedService, idSearch, selectedStatuses,
    memberNames, volunteerNames, serviceNames,
    matches, filteredRows, clearAll, statusFilterLabel
  }
}
