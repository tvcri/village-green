// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/vue'

vi.mock('../api/metaMetricsApi.js', () => ({
  getMetaMetrics: vi.fn(),
}))
// Chart.js needs a real canvas; stub the PrimeVue wrapper and assert on the
// data we hand it instead.
vi.mock('primevue/chart', () => ({
  default: { name: 'Chart', props: ['type', 'data', 'options'], template: '<div class="chart-stub" />' },
}))

import { getMetaMetrics } from '../api/metaMetricsApi.js'
import MetaMetrics from './MetaMetrics.vue'

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
    const { container } = render(MetaMetrics)
    await waitFor(() => expect(screen.getByText('Requests by service type')).toBeInTheDocument())
    // Detail is the default: the one cell's serviceName is a label.
    // `defineExpose` restricts the render proxy: the exposed refs land on
    // the mounted root node's component instance `exposeProxy`, not on the
    // wrapper `container` and not on the plain `.proxy` (which only carries
    // template-facing bindings once anything has been exposed explicitly).
    const vm = container.firstChild?.__vueParentComponent?.exposeProxy ?? null
    expect(vm).not.toBeNull()
    expect(vm.serviceLabelKey).toBe('serviceName')
    expect(vm.serviceRows.map(r => r.serviceName)).toEqual(['Ride: Medical Appnt'])
    // Category collapses to the fixed 4-entry vocabulary, zero-filled.
    vm.serviceGrain = 'category'
    await waitFor(() => expect(vm.serviceLabelKey).toBe('category'))
    expect(vm.serviceRows.map(r => r.category))
      .toEqual(['Rides', 'Errands', 'Home Help', 'Tech Support'])
    expect(vm.serviceRows.find(r => r.category === 'Rides').total).toBe(13)
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
