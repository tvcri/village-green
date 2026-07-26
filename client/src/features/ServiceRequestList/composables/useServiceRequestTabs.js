import { computed, ref } from 'vue'
import { useAsyncState } from '../../../shared/composables/useAsyncState.js'
import { dateToServiceDate } from '../lib/timeFields.js'

export const ACTIVE_STATUSES = ['open', 'confirmed']
// 'draft' is deliberately absent: it is neither an actionable worklist item
// nor a terminal archive record, and the UI keeps it hidden today.
export const HISTORIC_STATUSES = ['completed', 'unmatched', 'cancelled']

// The Active tab needs no lower bound — the nightly
// evt_auto_complete_service_requests sweep already caps open/confirmed to
// today-and-future. The endpoint requires serviceDateStart, so pass a
// deliberately wide sentinel rather than narrowing to today.
const ACTIVE_START_SENTINEL = '2000-01-01'

// serviceDate is a wall-clock civil date; do all arithmetic on the UTC
// calendar so no local timezone can shift the boundary by a day.
const shiftDays = (isoDate, days) => {
  const [y, m, d] = isoDate.split('-').map(Number)
  const t = Date.UTC(y, m - 1, d) + days * 86400000
  return new Date(t).toISOString().slice(0, 10)
}

// The user's local calendar date, via the wall-clock helper — toISOString()
// would give UTC's date, which is tomorrow for an evening user west of UTC.
const localToday = () => dateToServiceDate(new Date())

/**
 * Active/Historic tab state and fetches for a service request list.
 *
 * Each tab fetches through its own useAsyncState so an out-of-order response
 * can never overwrite a newer one, and failures raise the global error modal
 * (plus the per-tab inline `error` state).
 *
 * @param {object} opts
 * @param {(params: {status: string[], serviceDateStart: string, serviceDateEnd: string|undefined}) => Promise<Array>} opts.fetcher
 * @param {number} [opts.historicDays] size of the default historic window
 * @param {string} [opts.today] 'YYYY-MM-DD' override for tests
 */
export function useServiceRequestTabs ({ fetcher, historicDays = 60, today = localToday() }) {
  const activeTab = ref('active')

  const historicStart = ref(shiftDays(today, -historicDays))
  const historicEnd = ref('') // '' = unbounded

  const active = useAsyncState(
    () => fetcher({
      status: ACTIVE_STATUSES,
      serviceDateStart: ACTIVE_START_SENTINEL,
      serviceDateEnd: undefined
    }),
    { immediate: false }
  )
  const historic = useAsyncState(
    () => fetcher({
      status: HISTORIC_STATUSES,
      serviceDateStart: historicStart.value,
      serviceDateEnd: historicEnd.value || undefined
    }),
    { immediate: false }
  )

  const fetchActive = () => active.execute()
  const fetchHistoric = () => {
    // serviceDateStart is required by the endpoint; a cleared "From" input
    // must not fire a doomed request. Keep showing the last-fetched rows.
    if (!historicStart.value) return Promise.resolve(null)
    return historic.execute()
  }
  const fetchCurrent = () =>
    activeTab.value === 'active' ? fetchActive() : fetchHistoric()

  const currentTab = () => activeTab.value === 'active' ? active : historic

  const currentRows = computed(() => currentTab().state.value)
  const isLoading = computed(() => currentTab().isLoading.value)
  const error = computed(() => currentTab().error.value)

  // The status checkboxes a tab may offer are exactly the statuses it fetched:
  // narrowing is client-side, so offering more could only ever match nothing.
  const statusOptions = computed(() =>
    activeTab.value === 'active' ? ACTIVE_STATUSES : HISTORIC_STATUSES)

  return {
    activeTab,
    ACTIVE_STATUSES, HISTORIC_STATUSES, statusOptions,
    historicStart, historicEnd,
    // The state refs stay exposed (and writable) so components can null a tab
    // to force a refetch, or write a row update through (e.g. onNotified).
    activeRows: active.state, historicRows: historic.state,
    currentRows, isLoading, error,
    fetchActive, fetchHistoric, fetchCurrent
  }
}
