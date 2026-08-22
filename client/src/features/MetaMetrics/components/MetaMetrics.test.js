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

import { getMetaMetrics } from '../api/metaMetricsApi.js'
import MetaMetrics from './MetaMetrics.vue'

// The bars live IN the table rows, so there is no chart to stub and no chart
// props to inspect. These read the rendered DOM instead, which is a stronger
// assertion: it exercises the real PrimeVue DataTable rather than a stand-in.
const villageOrder = (container) =>
  [...container.querySelectorAll('.meta-matrix-table tbody tr')]
    .map(tr => tr.querySelector('td')?.textContent.trim())

const barWidths = (container, rowIndex) =>
  [...container.querySelectorAll('.meta-matrix-table tbody tr')[rowIndex]
    .querySelectorAll('.bar-seg')].map(s => parseFloat(s.style.width))

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
    // A second category, so the Categories tab has a real mix to render rather
    // than one full-width Rides bar per village.
    { villageId: '1', serviceName: 'Errand: Pharmacy', category: 'Errands',
      byStatus: { completed: 4, unmatched: 0, memberCancelled: 0, volunteerCancelled: 0 },
      completedRoundTrips: 0 },
    // A second Ride service, so Rides is drillable on the Detail tab. Errands
    // has only one service here and so must NOT be offered.
    { villageId: '1', serviceName: 'Ride: Shopping', category: 'Rides',
      byStatus: { completed: 6, unmatched: 0, memberCancelled: 0, volunteerCancelled: 0 },
      completedRoundTrips: 0 },
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
    const { container } = mountPage()
    await waitFor(() => expect(villageOrder(container).length).toBe(2))
    expect(villageOrder(container)).toEqual(['Barrington', 'Warwick'])
  })

  it('doubles completed counts for round trips', async () => {
    getMetaMetrics.mockResolvedValue(PAYLOAD)
    const { container } = mountPage()
    await waitFor(() => expect(villageOrder(container).length).toBe(2))
    // Barrington: completed 10 + roundTrips 3 = 13, in its own row.
    const firstRow = container.querySelectorAll('.meta-matrix-table tbody tr')[0]
    expect(firstRow.textContent).toContain('Barrington')
    expect(firstRow.textContent).toContain('13')
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
    const { container } = mountPage()
    await waitFor(() => expect(villageOrder(container).length).toBe(2))
    // Warwick has more unmatched than Barrington
    expect(villageOrder(container)).toEqual(['Warwick', 'Barrington'])
  })

  it('falls back to defaults for unknown URL values without writing a correction', async () => {
    mockRoute.query = { start: '2026-01-01', end: '2026-12-31', tab: 'banana', view: 'banana' }
    getMetaMetrics.mockResolvedValue(PAYLOAD)
    const { container } = mountPage()
    await waitFor(() => expect(villageOrder(container).length).toBe(2))
    expect(mockRoute.query.tab).toBe('banana')  // not corrected
    expect(screen.getByRole('tab', { name: 'Outcomes' })).toHaveAttribute('aria-selected', 'true')
  })

  it('puts the view toggle and its explanation above the tabs, not inside a tab', async () => {
    // One ?view= param drives every tab, so the control belongs above them —
    // inside a filter row it implied a per-table choice it never was. The note
    // travels with it because it describes what the toggle does.
    const { container } = mountPage()
    await waitFor(() => expect(villageOrder(container).length).toBe(2))
    const bar = container.querySelector('.view-bar')
    expect(bar).toBeTruthy()
    expect(bar.querySelector('.scale-note').textContent).toMatch(/bars share one scale/i)
    // And it is a sibling of the tab strip, not a descendant of a panel.
    expect(bar.querySelector('[role="tabpanel"]')).toBeNull()
  })

  it('changes the explanation with the view', async () => {
    mockRoute.query = { start: '2026-01-01', end: '2026-12-31', view: 'share' }
    const { container } = mountPage()
    await waitFor(() => expect(villageOrder(container).length).toBe(2))
    expect(container.querySelector('.scale-note').textContent)
      .toMatch(/own total, split by outcome/i)
  })

  it('changes the explanation with the tab', async () => {
    mockRoute.query = { start: '2026-01-01', end: '2026-12-31', tab: 'categories' }
    const { container } = mountPage()
    await waitFor(() => expect(villageOrder(container).length).toBe(2))
    expect(container.querySelector('.scale-note').textContent)
      .toMatch(/completed work only/i)
  })

  it('puts the CSV button on the tab strip rather than above the table', async () => {
    // It costs no vertical space there. The page owns the export because the
    // button sits above the card, and the target is a SIBLING of the tablist —
    // PrimeVue's only TabList slot is inside role="tablist", where a button
    // would be announced as a tab.
    const { container } = mountPage()
    await waitFor(() => expect(villageOrder(container).length).toBe(2))
    const slot = container.querySelector('.tabs-csv')
    expect(slot).toBeTruthy()
    expect(slot.textContent).toMatch(/download csv/i)
    expect(slot.closest('[role="tablist"]')).toBeNull()
    // And there is exactly one, not a leftover above the table too.
    expect([...container.querySelectorAll('button')]
      .filter(b => /download csv/i.test(b.textContent))).toHaveLength(1)
  })

  it('puts the PDF at page level and the CSV at table level', async () => {
    // Scope decides placement. The PDF covers all three tabs AND the summary
    // strip, so it belongs in the page-level row beside the view toggle. The
    // CSV is exactly one table, so it stays on the tab strip. Together they
    // would read as the same kind of export.
    const { container } = mountPage()
    await waitFor(() => expect(villageOrder(container).length).toBe(2))

    const find = re => [...container.querySelectorAll('button')]
      .find(b => re.test(b.textContent))

    expect(find(/download pdf/i).closest('.view-bar')).toBeTruthy()
    expect(find(/download pdf/i).closest('.tabs-csv')).toBeNull()
    expect(find(/download csv/i).closest('.tabs-csv')).toBeTruthy()
  })

  it('offers a Categories tab alongside Outcomes', async () => {
    const { container } = mountPage()
    await waitFor(() => expect(villageOrder(container).length).toBe(2))
    expect(screen.getByRole('tab', { name: 'Outcomes' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Categories' })).toBeInTheDocument()
  })

  it('renders category columns and stacked bars on the Categories tab', async () => {
    mockRoute.query = { start: '2026-01-01', end: '2026-12-31', tab: 'categories' }
    const { container } = mountPage()
    await waitFor(() => expect(villageOrder(container).length).toBe(2))
    expect(screen.getByText('Rides')).toBeInTheDocument()
    expect(screen.getByText('Errands')).toBeInTheDocument()
    // Categories stacks in BOTH views; Outcomes would group here.
    expect(container.querySelector('.bar-track')).toHaveClass('is-stacked')
  })

  it('counts completed work only on the Categories tab', async () => {
    mockRoute.query = { start: '2026-01-01', end: '2026-12-31', tab: 'categories' }
    const { container } = mountPage()
    await waitFor(() => expect(villageOrder(container).length).toBe(2))
    // Warwick rides: medical 8 + 2 round trips, plus shopping 6 = 16.
    // Errands 4. Its 5 unmatched and 3 cancelled are NOT work done.
    const warwick = [...container.querySelectorAll('.meta-matrix-table tbody tr')]
      .find(tr => tr.textContent.includes('Warwick'))
    expect(warwick.textContent).toContain('16')
    expect(warwick.textContent).toContain('4')
  })

  it('keeps the summary strip on outcome totals when the Categories tab is active', async () => {
    mockRoute.query = { start: '2026-01-01', end: '2026-12-31', tab: 'categories' }
    const { container } = mountPage()
    await waitFor(() => expect(villageOrder(container).length).toBe(2))
    // The strip must not change meaning under the reader on a tab switch.
    const strip = container.querySelector('.summary-strip')
    expect(strip.textContent).toContain('Unmatched')
  })

  it('offers a Detail tab beside Outcomes and Categories', async () => {
    const { container } = mountPage()
    await waitFor(() => expect(villageOrder(container).length).toBe(2))
    expect(screen.getByRole('tab', { name: 'Detail' })).toBeInTheDocument()
  })

  it('drills into one category, showing its services as columns', async () => {
    mockRoute.query = { start: '2026-01-01', end: '2026-12-31', tab: 'detail' }
    const { container } = mountPage()
    await waitFor(() => expect(villageOrder(container).length).toBe(2))
    // Rides is the only drillable category here, so it is the default. Column
    // headers lose the prefix the selector already states, and the long ones
    // are abbreviated further so they do not wrap.
    expect(screen.getByText('Medical')).toBeInTheDocument()
    expect(screen.getByText('Shopping')).toBeInTheDocument()
    // Stacked like Categories, since services partition their category's work.
    expect(container.querySelector('.bar-track')).toHaveClass('is-stacked')
  })

  it('offers no category with only one service, and no all-categories option', async () => {
    mockRoute.query = { start: '2026-01-01', end: '2026-12-31', tab: 'detail' }
    const { container } = mountPage()
    await waitFor(() => expect(villageOrder(container).length).toBe(2))
    // Errands has a single service in the fixture; a droplist entry for it
    // would show one column identical to the total.
    const select = container.querySelector('#detailCategory')
    expect(select.textContent).toContain('Rides')
    expect(select.textContent).not.toContain('Errands')
    expect(select.textContent).not.toMatch(/all/i)
  })

  it('carries the chosen category in the URL', async () => {
    mockRoute.query = { start: '2026-01-01', end: '2026-12-31', tab: 'detail', category: 'Rides' }
    const { container } = mountPage()
    await waitFor(() => expect(villageOrder(container).length).toBe(2))
    expect(screen.getByText('Medical')).toBeInTheDocument()
  })

  it('falls back to the first drillable category for an unknown one', async () => {
    mockRoute.query = { start: '2026-01-01', end: '2026-12-31', tab: 'detail', category: 'Banana' }
    const { container } = mountPage()
    await waitFor(() => expect(villageOrder(container).length).toBe(2))
    expect(screen.getByText('Medical')).toBeInTheDocument()
    // Read-and-fall-back, never a written correction.
    expect(mockRoute.query.category).toBe('Banana')
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

  // The headline claim, restated for the bar-in-table: a header click reorders
  // the rows, and each row's BAR travels with its own numbers because they are
  // the same <tr>. Barrington has 1 unmatched, Warwick 5. The first click sorts
  // ascending (Barrington, Warwick — identical to the villageName default, so
  // it alone would not catch a child ignoring the new sort); the second flips
  // to descending, which a regression cannot fake.
  it('reorders rows on a header click, carrying each bar with its own row', async () => {
    const { container } = await mountLoaded()
    expect(villageOrder(container)).toEqual(['Barrington', 'Warwick'])

    const unmatchedHeader = () => screen.getByText('Unmatched', { selector: '.p-datatable-column-title' })

    await fireEvent.click(unmatchedHeader())
    await waitFor(() => expect(mockRoute.query.sort).toBe('unmatched'))

    await fireEvent.click(unmatchedHeader())
    await waitFor(() => expect(mockRoute.query.dir).toBe('desc'))

    const expectedOrder = ['Warwick', 'Barrington']
    expect(villageOrder(container)).toEqual(expectedOrder)

    // And the bars moved WITH the rows: Warwick is now first, and its unmatched
    // segment (5) must now be the wider of the two villages' — the reverse of
    // the default order. A bar left behind by its row fails here.
    const warwickUnmatched = barWidths(container, 0)[2]
    const barringtonUnmatched = barWidths(container, 1)[2]
    expect(warwickUnmatched).toBeGreaterThan(barringtonUnmatched)
  })
})
