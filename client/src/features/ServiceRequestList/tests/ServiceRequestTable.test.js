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

  it('sorts ascending (soonest first) in both views when sortOrder is 1', () => {
    const { container } = render(ServiceRequestTable, {
      props: { ...baseProps, sortOrder: 1 }, global: { plugins: [PrimeVue] }
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

  it('orders same-date rows by startTime in both views', () => {
    const rows = [
      { serviceRequestId: '1', displayNumber: 101, status: 'Open', serviceName: 'Afternoon', serviceDate: '2026-07-11', startTime: '14:15:00' },
      { serviceRequestId: '2', displayNumber: 202, status: 'Open', serviceName: 'Morning', serviceDate: '2026-07-11', startTime: '09:00:00' },
      { serviceRequestId: '3', displayNumber: 303, status: 'Open', serviceName: 'Evening', serviceDate: '2026-07-11', startTime: '18:30:00' }
    ]
    const pick = (container, sel) =>
      Array.from(container.querySelectorAll(sel))
        .map(el => el.textContent)
        .map(t => ['Morning', 'Afternoon', 'Evening'].find(n => t.includes(n)))
        .filter(Boolean)

    const { container } = render(ServiceRequestTable, {
      props: { ...baseProps, rows, sortOrder: 1 }, global: { plugins: [PrimeVue] }
    })
    expect(pick(container, '.desktop-only tbody tr')).toEqual(['Morning', 'Afternoon', 'Evening'])
    expect(pick(container, '.request-cards .request-card')).toEqual(['Morning', 'Afternoon', 'Evening'])
  })

  // Only 'Ride: *' services carry times, so a date group routinely mixes timed
  // and untimed rows. Ascending is the lists' default view.
  it('places untimed rows after timed ones within a date, ascending', () => {
    const rows = [
      { serviceRequestId: '1', displayNumber: 101, status: 'Open', serviceName: 'Untimed', serviceDate: '2026-07-11', startTime: null },
      { serviceRequestId: '2', displayNumber: 202, status: 'Open', serviceName: 'Morning', serviceDate: '2026-07-11', startTime: '09:00:00' },
      { serviceRequestId: '3', displayNumber: 303, status: 'Open', serviceName: 'Evening', serviceDate: '2026-07-11', startTime: '18:30:00' }
    ]
    const pick = (container, sel) =>
      Array.from(container.querySelectorAll(sel))
        .map(el => el.textContent)
        .map(t => ['Morning', 'Evening', 'Untimed'].find(n => t.includes(n)))
        .filter(Boolean)

    const { container } = render(ServiceRequestTable, {
      props: { ...baseProps, rows, sortOrder: 1 }, global: { plugins: [PrimeVue] }
    })
    expect(pick(container, '.desktop-only tbody tr')).toEqual(['Morning', 'Evening', 'Untimed'])
    expect(pick(container, '.request-cards .request-card')).toEqual(['Morning', 'Evening', 'Untimed'])
  })

  // The date grouping must survive the tiebreak: a later date's earliest slot
  // never outranks an earlier date's latest one.
  it('keeps dates grouped ahead of the startTime tiebreak', () => {
    const rows = [
      { serviceRequestId: '1', displayNumber: 101, status: 'Open', serviceName: 'Day2Early', serviceDate: '2026-07-12', startTime: '08:00:00' },
      { serviceRequestId: '2', displayNumber: 202, status: 'Open', serviceName: 'Day1Late', serviceDate: '2026-07-11', startTime: '23:00:00' }
    ]
    const { container } = render(ServiceRequestTable, {
      props: { ...baseProps, rows, sortOrder: 1 }, global: { plugins: [PrimeVue] }
    })
    const text = container.textContent
    expect(text.indexOf('Day1Late')).toBeLessThan(text.indexOf('Day2Early'))
  })

  it('defaults to soonest-first when no sortOrder is passed', () => {
    const rows = [
      { serviceRequestId: 1, serviceDate: '2026-07-01', displayNumber: 'A-1', status: 'Open' },
      { serviceRequestId: 2, serviceDate: '2026-07-20', displayNumber: 'A-2', status: 'Open' }
    ]
    const { container } = render(ServiceRequestTable, {
      props: { rows, isLoading: false, hasLoadedOnce: true, error: null },
      global: { plugins: [PrimeVue] }
    })
    const text = container.textContent
    expect(text.indexOf('A-1')).toBeLessThan(text.indexOf('A-2'))
  })
})
