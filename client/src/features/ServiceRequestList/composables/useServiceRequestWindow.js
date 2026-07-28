import { ref, watch } from 'vue'
import { useAsyncState } from '../../../shared/composables/useAsyncState.js'
import { dateToServiceDate } from '../lib/timeFields.js'

// One table, one fetch: every status the list can show. 'cancelled' is a single
// key that matches all three DB values (member/volunteer/hub) downstream in
// useServiceRequestFilters; never split it here.
export const ALL_STATUSES = Object.freeze([
  'open', 'confirmed', 'completed', 'unmatched', 'cancelled'
])

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
 * Date-window state and the single fetch behind a service request list.
 *
 * The window is the only server-side narrowing: every status is fetched, and
 * status/member/volunteer/service/ID filtering is client-side in
 * useServiceRequestFilters. Fetching through useAsyncState keeps the
 * stale-response guard and routes failures to the global error modal.
 *
 * @param {object} opts
 * @param {(params: {status: string[], serviceDateStart: string, serviceDateEnd: string|undefined}) => Promise<Array>} opts.fetcher
 * @param {() => boolean} [opts.canFetch] guard: when it returns false no request
 *   is made and the last-fetched rows are kept (e.g. a route param went away)
 * @param {number} [opts.windowDays] size of the default lookback
 * @param {string} [opts.today] 'YYYY-MM-DD' override for tests
 */
export function useServiceRequestWindow ({ fetcher, canFetch, windowDays = 30, today = localToday() }) {
  const windowStartDefault = shiftDays(today, -windowDays)
  const windowStart = ref(windowStartDefault)
  const windowEnd = ref('') // '' = unbounded

  const async = useAsyncState(
    () => fetcher({
      status: [...ALL_STATUSES],
      serviceDateStart: windowStart.value,
      serviceDateEnd: windowEnd.value || undefined
    }),
    { immediate: false }
  )

  const fetchRows = () => {
    // A guarded fetch never runs, so the list keeps its last-fetched rows
    // rather than blanking them.
    if (canFetch && !canFetch()) return Promise.resolve(null)
    // serviceDateStart is required by the endpoint; a cleared "From" input
    // must not fire a doomed request. Drop the stale rows rather than leaving
    // the previous window's data under a blank date control — the table's
    // empty state is honest, and an export can't ship a window the user
    // isn't looking at.
    if (!windowStart.value) {
      async.state.value = null
      return Promise.resolve(null)
    }
    return async.execute()
  }

  // Tracked so the table can tell "first load in flight" (spinner) from
  // "loaded and genuinely empty" (empty state). A failed first fetch must
  // leave this false, or the empty state hides the error.
  const hasLoadedOnce = ref(false)
  watch(async.state, (val) => { if (val !== null) hasLoadedOnce.value = true })

  return {
    windowStart, windowEnd, windowStartDefault,
    ALL_STATUSES,
    // rows stays writable so components can null it to force a refetch, or
    // write a row update through (e.g. onNotified).
    rows: async.state,
    isLoading: async.isLoading,
    error: async.error,
    hasLoadedOnce,
    fetchRows
  }
}
