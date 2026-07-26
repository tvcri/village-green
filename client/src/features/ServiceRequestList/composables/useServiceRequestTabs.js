import { ref, computed } from 'vue'

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

const todayIso = () => new Date().toISOString().slice(0, 10)

/**
 * Active/Historic tab state and fetches for a service request list.
 * @param {object} opts
 * @param {(params: {status: string[], serviceDateStart: string, serviceDateEnd: string|undefined}) => Promise<Array>} opts.fetcher
 * @param {number} [opts.historicDays] size of the default historic window
 * @param {string} [opts.today] 'YYYY-MM-DD' override for tests
 */
export function useServiceRequestTabs ({ fetcher, historicDays = 60, today = todayIso() }) {
  const activeTab = ref('active')

  const historicStart = ref(shiftDays(today, -historicDays))
  const historicEnd = ref('') // '' = unbounded

  const activeRows = ref(null)
  const historicRows = ref(null)
  const isLoading = ref(false)
  const error = ref(null)

  const run = async (target) => {
    isLoading.value = true
    error.value = null
    try {
      if (target === 'active') {
        activeRows.value = await fetcher({
          status: ACTIVE_STATUSES,
          serviceDateStart: ACTIVE_START_SENTINEL,
          serviceDateEnd: undefined
        })
      } else {
        historicRows.value = await fetcher({
          status: HISTORIC_STATUSES,
          serviceDateStart: historicStart.value,
          serviceDateEnd: historicEnd.value || undefined
        })
      }
    } catch (e) {
      error.value = e
    } finally {
      isLoading.value = false
    }
  }

  const fetchActive = () => run('active')
  const fetchHistoric = () => run('historic')
  const fetchCurrent = () => run(activeTab.value)

  const currentRows = computed(() =>
    activeTab.value === 'active' ? activeRows.value : historicRows.value)

  return {
    activeTab,
    ACTIVE_STATUSES, HISTORIC_STATUSES,
    historicStart, historicEnd,
    activeRows, historicRows, currentRows,
    isLoading, error,
    fetchActive, fetchHistoric, fetchCurrent
  }
}
