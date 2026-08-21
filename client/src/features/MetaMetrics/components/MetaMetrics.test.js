// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/vue'
import { nextTick, reactive } from 'vue'
import PrimeVue from 'primevue/config'

// mockRoute is REACTIVE and mockRouter.replace WRITES BACK into it, assigning a brand new
// query object exactly as vue-router 4 does per navigation. An inert replace() that never
// mutates the route cannot observe query-driven re-renders or refetches — see
// VillageMetrics.test.js, which this file's router setup mirrors.
const mockRoute = reactive({ params: {}, query: {} })

const mockRouter = {
  replace: vi.fn(({ query }) => {
    mockRoute.query = { ...query }
  }),
  push: vi.fn(),
}

vi.mock('vue-router', () => ({
  useRoute: () => mockRoute,
  useRouter: () => mockRouter,
}))

vi.mock('../api/metaMetricsApi.js', () => ({
  getMetaMetrics: vi.fn(),
}))
// Chart.js needs a real canvas; stub the PrimeVue wrapper and assert on the
// data we hand it instead. The stub records `data` on every render (in
// `setup`'s returned render fn, not `setup` itself, which only runs once) so a
// reactive prop change from clicking the toggle is observable — matching the
// ChartStub pattern in VillageMetrics.test.js. Both charts on this page share
// the stub, so entries are told apart by their labels rather than by instance.
let chartRenders = []
vi.mock('primevue/chart', () => ({
  default: {
    name: 'Chart',
    props: ['type', 'data', 'options'],
    setup (props) {
      return () => {
        chartRenders.push(props.data)
        return null
      }
    },
  },
}))

import { getMetaMetrics } from '../api/metaMetricsApi.js'
import MetaMetrics from './MetaMetrics.vue'

// Finds the most recent render of the chart whose labels are a subset of
// `candidateLabels` — i.e. the service chart, distinguished from the village
// chart by vocabulary rather than by render order or DOM position.
function latestChartWithLabels (candidateLabels) {
  for (let i = chartRenders.length - 1; i >= 0; i--) {
    const data = chartRenders[i]
    if (data.labels.every(l => candidateLabels.includes(l))) return data
  }
  return null
}

const PAYLOAD = {
  range: { start: '2026-05-22', end: '2026-06-20' },
  villages: [
    { villageId: '1', villageName: 'Quahog' },
    { villageId: '2', villageName: 'Empty Harbor' },
  ],
  cells: [
    {
      villageId: '1', serviceName: 'Ride: Medical Appnt', category: 'Rides',
      byStatus: { completed: 10, unmatched: 1, memberCancelled: 2, volunteerCancelled: 0 },
      completedRoundTrips: 4,
    },
  ],
}

function renderPage () {
  return render(MetaMetrics, {
    global: {
      plugins: [PrimeVue],
    },
  })
}

async function renderLoaded () {
  const utils = renderPage()
  await waitFor(() => expect(screen.getByText('Requests by village')).toBeInTheDocument())
  return utils
}

beforeEach(() => {
  window.matchMedia = window.matchMedia || (q => ({
    matches: false, media: q, addEventListener () {}, removeEventListener () {},
    addListener () {}, removeListener () {}, onchange: null, dispatchEvent: () => false,
  }))
  global.ResizeObserver = class { observe () {} unobserve () {} disconnect () {} }
  // reset the reactive route in place (it is a const reactive, not reassignable)
  mockRoute.params = {}
  mockRoute.query = { start: '2026-01-01', end: '2026-12-31' }
  mockRouter.replace.mockClear()
  mockRouter.push.mockClear()
  getMetaMetrics.mockReset()
  getMetaMetrics.mockResolvedValue(PAYLOAD)
  chartRenders = []
})

afterEach(() => cleanup())

describe('MetaMetrics', () => {
  it('renders a chart card once the payload arrives', async () => {
    await renderLoaded()
    expect(getMetaMetrics).toHaveBeenCalledTimes(1)
    expect(getMetaMetrics).toHaveBeenCalledWith('2026-01-01', '2026-12-31')
    // a valid range must not provoke a normalizing replace
    expect(mockRouter.replace).not.toHaveBeenCalled()
  })

  it('normalizes a missing range to this-year without dropping other query keys', async () => {
    mockRoute.query = { foo: 'bar' }
    renderPage()
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalled())
    const { query } = mockRouter.replace.mock.calls[0][0]
    expect(query.foo).toBe('bar')
    expect(query.start).toBeTruthy()
    expect(query.end).toBeTruthy()
    // The write-back makes the range valid, so exactly one real fetch follows the
    // normalize — never two (no double-fetch, no replace loop).
    await waitFor(() => expect(getMetaMetrics).toHaveBeenCalledTimes(1))
    expect(getMetaMetrics).toHaveBeenCalledWith(query.start, query.end)
    expect(mockRouter.replace).toHaveBeenCalledTimes(1)
  })

  it('switches the service chart between service names and categories', async () => {
    await renderLoaded()
    await waitFor(() => expect(screen.getByText('Requests by service type')).toBeInTheDocument())

    // Detail is the default: the one cell's serviceName is the chart's only label.
    await waitFor(() => {
      const detail = latestChartWithLabels(['Ride: Medical Appnt'])
      expect(detail).not.toBeNull()
      expect(detail.labels).toEqual(['Ride: Medical Appnt'])
    })

    // Drive the real SelectButton control, not an internal setter.
    await fireEvent.click(screen.getByText('Category'))
    await nextTick()

    // Category collapses to the fixed 4-entry vocabulary, zero-filled.
    await waitFor(() => {
      const category = latestChartWithLabels(['Rides', 'Errands', 'Home Help', 'Tech Support'])
      expect(category).not.toBeNull()
      expect(category.labels).toEqual(['Rides', 'Errands', 'Home Help', 'Tech Support'])
    })
  })

  it('shows an access message when the caller has no granted villages', async () => {
    const err = new Error('forbidden')
    err.status = 403
    getMetaMetrics.mockReset()
    getMetaMetrics.mockRejectedValue(err)
    renderPage()
    await waitFor(() => {
      expect(screen.getByText(/no villages/i)).toBeInTheDocument()
    })
  })

  // ---- range-change refetch behavior ----
  it('refetches when the range actually changes', async () => {
    await renderLoaded()
    expect(getMetaMetrics).toHaveBeenCalledTimes(1)

    // simulate the range picker emitting a new range through the same router path
    mockRoute.query = { ...mockRoute.query, start: '2025-01-01', end: '2025-12-31' }
    await waitFor(() => expect(getMetaMetrics).toHaveBeenCalledTimes(2))
    expect(getMetaMetrics).toHaveBeenLastCalledWith('2025-01-01', '2025-12-31')
  })

  // The two chart toggles are pure client-side reductions of the already-fetched
  // payload; only a range change should ever trigger a network call.
  it('does not refetch when a toggle (Share / Category) changes', async () => {
    await renderLoaded()
    expect(getMetaMetrics).toHaveBeenCalledTimes(1)

    await fireEvent.click(screen.getByText('Share'))
    await nextTick()
    expect(getMetaMetrics).toHaveBeenCalledTimes(1)

    await fireEvent.click(screen.getByText('Category'))
    await nextTick()
    expect(getMetaMetrics).toHaveBeenCalledTimes(1)
  })
})
