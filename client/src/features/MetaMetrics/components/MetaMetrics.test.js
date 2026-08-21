// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/vue'
import { reactive } from 'vue'
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
// ChartStub pattern in VillageMetrics.test.js.
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

const PAYLOAD = {
  range: { start: '2026-01-01', end: '2026-12-31' },
  villages: [
    { villageId: '1', villageName: 'Warwick' },
    { villageId: '2', villageName: 'Barrington' },
  ],
  cells: [
    { villageId: '1', serviceName: 'Ride: Medical Appnt', category: 'Rides',
      byStatus: { completed: 8, unmatched: 5, memberCancelled: 2, volunteerCancelled: 1 },
      completedRoundTrips: 2 },
    { villageId: '2', serviceName: 'Ride: Medical Appnt', category: 'Rides',
      byStatus: { completed: 10, unmatched: 1, memberCancelled: 3, volunteerCancelled: 0 },
      completedRoundTrips: 3 },
  ],
}

const mountPage = () => render(MetaMetrics, {
  global: { plugins: [PrimeVue], stubs: { MetricsRangePicker: true } },
})

// Mount and wait for the payload to land. 'Villages' is the first summary-strip
// card and only renders once `payload` is set, so it is the loaded-state signal
// the other tests already key on.
async function mountLoaded () {
  const utils = mountPage()
  await waitFor(() => expect(screen.getByText('Villages')).toBeInTheDocument())
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

describe('MetaMetrics page shell', () => {
  it('shows the five-card summary strip', async () => {
    getMetaMetrics.mockResolvedValue(PAYLOAD)
    const { container } = mountPage()
    await waitFor(() => expect(screen.getByText('Villages')).toBeInTheDocument())
    // Scoped to the strip: 'Completed'/'Cancelled'/'Unmatched' are also matrix-table
    // column headers, so a page-wide getByText would match more than one element.
    // The strip's own five labels are the claim under test.
    const strip = container.querySelector('.summary-strip')
    expect(strip).not.toBeNull()
    expect([...strip.querySelectorAll('.stat-label')].map(el => el.textContent))
      .toEqual(['Villages', 'Requests', 'Completed', 'Cancelled', 'Unmatched'])
  })

  it('states the counting rules under the title', async () => {
    getMetaMetrics.mockResolvedValue(PAYLOAD)
    mountPage()
    await waitFor(() => {
      expect(screen.getByText(/round-trip rides count as two services/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/hub-cancelled requests are excluded/i)).toBeInTheDocument()
  })

  it('renders no round-trip toggle', async () => {
    getMetaMetrics.mockResolvedValue(PAYLOAD)
    mountPage()
    await waitFor(() => expect(screen.getByText('Villages')).toBeInTheDocument())
    expect(screen.queryByLabelText(/round trip = 2 legs/i)).not.toBeInTheDocument()
  })

  it('defaults to the outcomes tab', async () => {
    getMetaMetrics.mockResolvedValue(PAYLOAD)
    mountPage()
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Outcomes' })).toBeInTheDocument())
    expect(screen.getByRole('tab', { name: 'Outcomes' })).toHaveAttribute('aria-selected', 'true')
  })

  it('orders rows by village name ascending on first render', async () => {
    getMetaMetrics.mockResolvedValue(PAYLOAD)
    mountPage()
    await waitFor(() => expect(chartRenders.length).toBeGreaterThan(0))
    expect(chartRenders.at(-1).labels).toEqual(['Barrington', 'Warwick'])
  })

  it('doubles completed counts for round trips', async () => {
    getMetaMetrics.mockResolvedValue(PAYLOAD)
    mountPage()
    await waitFor(() => expect(chartRenders.length).toBeGreaterThan(0))
    const completed = chartRenders.at(-1).datasets[0]
    // Barrington: completed 10 + roundTrips 3 = 13
    expect(completed.data[0]).toBe(13)
  })

  it('writes the view to the URL when Share is chosen', async () => {
    getMetaMetrics.mockResolvedValue(PAYLOAD)
    mountPage()
    await waitFor(() => expect(screen.getByText('Share')).toBeInTheDocument())
    await fireEvent.click(screen.getByText('Share'))
    await waitFor(() => expect(mockRoute.query.view).toBe('share'))
  })

  it('reads the sort from the URL and applies it to the chart', async () => {
    mockRoute.query = { start: '2026-01-01', end: '2026-12-31', sort: 'unmatched', dir: 'desc' }
    getMetaMetrics.mockResolvedValue(PAYLOAD)
    mountPage()
    await waitFor(() => expect(chartRenders.length).toBeGreaterThan(0))
    // Warwick has more unmatched than Barrington
    expect(chartRenders.at(-1).labels).toEqual(['Warwick', 'Barrington'])
  })

  it('falls back to defaults for unknown URL values without writing a correction', async () => {
    mockRoute.query = { start: '2026-01-01', end: '2026-12-31', tab: 'banana', view: 'banana' }
    getMetaMetrics.mockResolvedValue(PAYLOAD)
    mountPage()
    await waitFor(() => expect(chartRenders.length).toBeGreaterThan(0))
    expect(mockRoute.query.tab).toBe('banana')  // not corrected
    expect(screen.getByRole('tab', { name: 'Outcomes' })).toHaveAttribute('aria-selected', 'true')
  })

  it('shows an inline notice rather than crashing on 403', async () => {
    // getHttpStatus() reads `err.status` directly (apiClient.js:58) — NOT
    // `err.response.status`. A nested shape here silently yields null and the
    // notice never renders.
    getMetaMetrics.mockRejectedValue(Object.assign(new Error('Forbidden'), { status: 403 }))
    mountPage()
    await waitFor(() => expect(screen.getByText(/no villages in scope/i)).toBeInTheDocument())
  })

  // ---- fetch-lifecycle guards ----
  // These four cover the three traps the page comments call load-bearing: the
  // primitive `rangeKey` watch source, `normalizeRange()` returning false so the
  // router.replace re-triggers the watcher, and onMounted's single trigger.
  // Without them a regression that double-fetches — or that refetches on every
  // sort click — leaves the rest of the suite green.

  it('fetches once on entry with a valid range', async () => {
    await mountLoaded()
    expect(getMetaMetrics).toHaveBeenCalledTimes(1)
    expect(getMetaMetrics).toHaveBeenCalledWith('2026-01-01', '2026-12-31')
    // a valid range must not provoke a normalizing replace
    expect(mockRouter.replace).not.toHaveBeenCalled()
  })

  it('normalizes a missing range to this-year without dropping other query keys', async () => {
    mockRoute.query = { foo: 'bar' }
    mountPage()
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

  it('refetches when the range actually changes', async () => {
    await mountLoaded()
    expect(getMetaMetrics).toHaveBeenCalledTimes(1)

    // simulate the range picker emitting a new range through the same router path
    mockRoute.query = { ...mockRoute.query, start: '2025-01-01', end: '2025-12-31' }
    await waitFor(() => expect(getMetaMetrics).toHaveBeenCalledTimes(2))
    expect(getMetaMetrics).toHaveBeenLastCalledWith('2025-01-01', '2025-12-31')
  })

  // The view toggle and the table sort are pure client-side reductions of the
  // already-fetched payload; only a range change should ever trigger a network
  // call. Both navigate — they write `view`/`sort` into the query — so this is
  // what guards the primitive `rangeKey` watch source: watching the `range`
  // OBJECT instead would refetch here, because vue-router hands back a brand-new
  // query object on every navigation.
  it('does not refetch when the view toggle or the sort changes', async () => {
    await mountLoaded()
    expect(getMetaMetrics).toHaveBeenCalledTimes(1)

    await fireEvent.click(screen.getByText('Share'))
    await waitFor(() => expect(mockRoute.query.view).toBe('share'))
    expect(getMetaMetrics).toHaveBeenCalledTimes(1)

    // Drive the real table header, not an internal setter.
    await fireEvent.click(screen.getByText('Unmatched', { selector: '.p-datatable-column-title' }))
    await waitFor(() => expect(mockRoute.query.sort).toBe('unmatched'))
    expect(getMetaMetrics).toHaveBeenCalledTimes(1)
  })

  // The headline claim: one ordered list drives BOTH children off a single
  // header click, so they can never disagree. Barrington has 1 unmatched,
  // Warwick has 5. The first click on Unmatched sorts ascending (Barrington,
  // Warwick — same as the villageName default, so it alone wouldn't catch a
  // child that silently ignored the new sort); the second click flips to
  // descending (Warwick, Barrington), which only a regression would miss in
  // exactly one of the two children.
  it('reorders the chart and the table together when a header is clicked', async () => {
    await mountLoaded()
    expect(chartRenders.at(-1).labels).toEqual(['Barrington', 'Warwick'])

    const unmatchedHeader = () => screen.getByText('Unmatched', { selector: '.p-datatable-column-title' })

    await fireEvent.click(unmatchedHeader())
    await waitFor(() => expect(mockRoute.query.sort).toBe('unmatched'))

    await fireEvent.click(unmatchedHeader())
    await waitFor(() => expect(mockRoute.query.dir).toBe('desc'))

    const expectedOrder = ['Warwick', 'Barrington']
    expect(chartRenders.at(-1).labels).toEqual(expectedOrder)

    // Scoped to tbody: PrimeVue's footer <td> also carries an implicit cell
    // role, and its "Total" label would otherwise leak into this list.
    const firstColumnCells = [...document.querySelectorAll('[data-pc-section="tbody"] td:first-child')]
      .map(c => c.textContent.trim())
    expect(firstColumnCells).toEqual(expectedOrder)
  })
})
