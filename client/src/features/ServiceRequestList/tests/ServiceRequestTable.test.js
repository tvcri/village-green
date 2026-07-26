// @vitest-environment jsdom
import { render, screen } from '@testing-library/vue'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup } from '@testing-library/vue'
import PrimeVue from 'primevue/config'
import ServiceRequestTable from '../components/ServiceRequestTable.vue'

vi.mock('../../../shared/api/analyticsApi.js', () => ({
  postAnalyticsEvents: vi.fn().mockResolvedValue(undefined)
}))

const ROWS = [
  { serviceRequestId: '1', displayNumber: 101, status: 'Completed', serviceName: 'Middle', serviceDate: '2026-07-11' },
  { serviceRequestId: '2', displayNumber: 202, status: 'Completed', serviceName: 'Oldest', serviceDate: '2026-07-10' },
  { serviceRequestId: '3', displayNumber: 303, status: 'Completed', serviceName: 'Newest', serviceDate: '2026-07-12' }
]

const baseProps = { rows: ROWS, isLoading: false, hasLoadedOnce: true, error: null }

// Read each view separately: the DataTable sorts internally, while the mobile
// cards iterate the component's own sortedRows. Both must agree, and a helper
// that merged them would mask a regression in either one.
const desktopOrder = (container) =>
  Array.from(container.querySelectorAll('.desktop-only tbody tr'))
    .map(tr => tr.textContent)
    .map(t => ['Oldest', 'Middle', 'Newest'].find(n => t.includes(n)))
    .filter(Boolean)

const mobileOrder = (container) =>
  Array.from(container.querySelectorAll('.request-cards .request-card'))
    .map(card => card.textContent)
    .map(t => ['Oldest', 'Middle', 'Newest'].find(n => t.includes(n)))
    .filter(Boolean)

describe('ServiceRequestTable serviceDate ordering', () => {
  beforeEach(() => {
    window.matchMedia = () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {}
    })
  })
  afterEach(() => { cleanup() })

  it('defaults to ascending (soonest first) in both views', () => {
    const { container } = render(ServiceRequestTable, {
      props: baseProps, global: { plugins: [PrimeVue] }
    })
    expect(desktopOrder(container)).toEqual(['Oldest', 'Middle', 'Newest'])
    expect(mobileOrder(container)).toEqual(['Oldest', 'Middle', 'Newest'])
  })

  it('sorts descending (most recent first) in both views when sortOrder is -1', () => {
    const { container } = render(ServiceRequestTable, {
      props: { ...baseProps, sortOrder: -1 },
      global: { plugins: [PrimeVue] }
    })
    expect(desktopOrder(container)).toEqual(['Newest', 'Middle', 'Oldest'])
    expect(mobileOrder(container)).toEqual(['Newest', 'Middle', 'Oldest'])
  })

  it('does not mutate the rows prop while sorting', () => {
    const rows = [...ROWS]
    render(ServiceRequestTable, {
      props: { ...baseProps, rows, sortOrder: -1 },
      global: { plugins: [PrimeVue] }
    })
    expect(rows.map(r => r.serviceRequestId)).toEqual(['1', '2', '3'])
  })
})
