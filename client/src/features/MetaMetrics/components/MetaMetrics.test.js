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
})
