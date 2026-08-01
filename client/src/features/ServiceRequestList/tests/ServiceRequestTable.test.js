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

// Read each view separately. Both now render the same sortedRows, but keeping
// the assertions independent is what would catch the table drifting back to
// sorting internally -- a merged helper would hide exactly that regression.
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

// Sorting by any other column keeps date+time as an implicit secondary key, so
// a volunteer's or village's requests still read in the order they happen.
// Before this, clicking any non-date header left dates arbitrary within groups.
describe('ServiceRequestTable secondary date ordering', () => {
  // Volunteers deliberately out of order, with dates interleaved across them so
  // a single-key sort on either field alone would fail these assertions.
  const ROWS = [
    { serviceRequestId: '1', displayNumber: 'burke-late', status: 'Open', volunteerFullName: 'Burke, Anne', serviceDate: '2026-08-20', startTime: '09:00:00' },
    { serviceRequestId: '2', displayNumber: 'areson-early', status: 'Open', volunteerFullName: 'Areson, Paul', serviceDate: '2026-08-22', startTime: '09:00:00' },
    { serviceRequestId: '3', displayNumber: 'burke-early', status: 'Open', volunteerFullName: 'Burke, Anne', serviceDate: '2026-08-03', startTime: '09:00:00' },
    { serviceRequestId: '4', displayNumber: 'areson-late', status: 'Open', volunteerFullName: 'Areson, Paul', serviceDate: '2026-08-29', startTime: '09:00:00' },
    { serviceRequestId: '5', displayNumber: 'burke-mid', status: 'Open', volunteerFullName: 'Burke, Anne', serviceDate: '2026-08-13', startTime: '14:00:00' }
  ]

  const LABELS = ['areson-early', 'areson-late', 'burke-early', 'burke-mid', 'burke-late']

  const orderOf = (container, selector) =>
    Array.from(container.querySelectorAll(selector))
      .map(el => el.textContent)
      .map(t => LABELS.find(n => t.includes(n)))
      .filter(Boolean)

  const desktopOrder = (container) => orderOf(container, '.desktop-only tbody tr')

  // PrimeVue emits @sort from a header click; the component mirrors that into
  // its own sort state. Clicking the text node is what a user actually hits.
  const clickHeader = async (getByText, label) => {
    getByText(label).click()
    await new Promise(resolve => setTimeout(resolve, 0))
  }

  const renderTable = (props = {}) => render(ServiceRequestTable, {
    props: { rows: ROWS, isLoading: false, hasLoadedOnce: true, error: null, ...props },
    global: { plugins: [PrimeVue] }
  })

  beforeEach(() => {
    window.matchMedia = () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {}
    })
  })
  afterEach(() => { cleanup() })

  it('groups by the clicked column with dates ascending inside each group', async () => {
    const { container, getByText } = renderTable()
    await clickHeader(getByText, 'Volunteer')
    expect(desktopOrder(container)).toEqual([
      'areson-early', 'areson-late', 'burke-early', 'burke-mid', 'burke-late'
    ])
  })

  // The appended date key stays ascending when the primary reverses: within one
  // volunteer, dates should still read earliest-first.
  it('keeps dates ascending within a group when the primary sorts descending', async () => {
    const { container, getByText } = renderTable()
    await clickHeader(getByText, 'Volunteer')
    await clickHeader(getByText, 'Volunteer')
    expect(desktopOrder(container)).toEqual([
      'burke-early', 'burke-mid', 'burke-late', 'areson-early', 'areson-late'
    ])
  })

  // Assert BOTH views: the DataTable moves empty values on its own (PrimeVue's
  // sort() swaps in nullSortOrder when either side is empty), so only the
  // component's own null guard keeps the mobile cards agreeing with it. A
  // desktop-only assertion passes with that guard deleted -- the views silently
  // disagree instead, which is the regression worth catching.
  it('sorts nullish primary values last in both views and directions', async () => {
    const rows = [
      ...ROWS,
      { serviceRequestId: '6', displayNumber: 'unassigned', status: 'Open', volunteerFullName: null, serviceDate: '2026-08-01', startTime: '09:00:00' }
    ]
    const { container, getByText } = renderTable({ rows })
    const lastOf = (selector) =>
      Array.from(container.querySelectorAll(selector)).at(-1).textContent

    await clickHeader(getByText, 'Volunteer')
    expect(lastOf('.desktop-only tbody tr')).toContain('unassigned')
    expect(lastOf('.request-cards .request-card')).toContain('unassigned')

    await clickHeader(getByText, 'Volunteer')
    expect(lastOf('.desktop-only tbody tr')).toContain('unassigned')
    expect(lastOf('.request-cards .request-card')).toContain('unassigned')
  })
})
