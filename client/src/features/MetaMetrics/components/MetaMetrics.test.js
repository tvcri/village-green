// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/vue'
import { nextTick } from 'vue'

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

beforeEach(() => {
  window.matchMedia = window.matchMedia || (q => ({
    matches: false, media: q, addEventListener () {}, removeEventListener () {},
    addListener () {}, removeListener () {}, onchange: null, dispatchEvent: () => false,
  }))
  global.ResizeObserver = class { observe () {} unobserve () {} disconnect () {} }
  getMetaMetrics.mockReset()
  chartRenders = []
})

afterEach(() => cleanup())

describe('MetaMetrics', () => {
  it('renders a chart card once the payload arrives', async () => {
    getMetaMetrics.mockResolvedValue(PAYLOAD)
    render(MetaMetrics)
    await waitFor(() => {
      expect(screen.getByText('Requests by village')).toBeInTheDocument()
    })
  })

  it('switches the service chart between service names and categories', async () => {
    getMetaMetrics.mockResolvedValue(PAYLOAD)
    render(MetaMetrics)
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
    getMetaMetrics.mockRejectedValue(err)
    render(MetaMetrics)
    await waitFor(() => {
      expect(screen.getByText(/no villages/i)).toBeInTheDocument()
    })
  })
})
