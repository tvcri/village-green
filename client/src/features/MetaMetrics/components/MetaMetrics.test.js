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
  getMetaMetricsPersons: vi.fn(),
}))

// Only the builder is replaced, so a test can read the sections it was handed;
// everything else in the module stays real.
vi.mock('../lib/metaMetricsPdf.js', async (importOriginal) => ({
  ...(await importOriginal()),
  buildMetaMetricsPdf: vi.fn(async () => new Uint8Array()),
}))

// Only the browser download is replaced; toCsv stays real so a test can read
// the file contents it was handed.
vi.mock('../../../shared/lib/csvUtils.js', async (importOriginal) => ({
  ...(await importOriginal()),
  downloadCsv: vi.fn(),
}))

const toastAdd = vi.fn()
vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: toastAdd }) }))

import { getMetaMetrics, getMetaMetricsPersons } from '../api/metaMetricsApi.js'
import { buildMetaMetricsPdf } from '../lib/metaMetricsPdf.js'
import { downloadCsv } from '../../../shared/lib/csvUtils.js'
import MetaMetrics from './MetaMetrics.vue'

// The bars live IN the table rows, so there is no chart to stub and no chart
// props to inspect. These read the rendered DOM instead, which is a stronger
// assertion: it exercises the real PrimeVue DataTable rather than a stand-in.
// The table's first body row is the pinned 'All Villages' totals line, not a
// village — every helper here indexes the VILLAGE rows beneath it.
const villageRows = (container) =>
  [...container.querySelectorAll('.meta-matrix-table tbody tr:not(.totals-row)')]

const villageOrder = (container) =>
  villageRows(container).map(tr => tr.querySelector('td')?.textContent.trim())

const barWidths = (container, rowIndex) =>
  [...villageRows(container)[rowIndex]
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
      roundTrips: { completed: 2, unmatched: 0, memberCancelled: 0, volunteerCancelled: 0 } },
    { villageId: '2', serviceName: 'Ride: Medical Appnt', category: 'Rides',
      byStatus: { completed: 10, unmatched: 1, memberCancelled: 3, volunteerCancelled: 0 },
      roundTrips: { completed: 3, unmatched: 0, memberCancelled: 0, volunteerCancelled: 0 } },
    // A second category, so the Categories tab has a real mix to render rather
    // than one full-width Rides bar per village.
    { villageId: '1', serviceName: 'Errand: Pharmacy', category: 'Errands',
      byStatus: { completed: 4, unmatched: 0, memberCancelled: 0, volunteerCancelled: 0 },
      roundTrips: { completed: 0, unmatched: 0, memberCancelled: 0, volunteerCancelled: 0 } },
    // A second Ride service, so Rides is drillable on the Detail tab. Errands
    // has only one service here and so must NOT be offered.
    { villageId: '1', serviceName: 'Ride: Shopping', category: 'Rides',
      byStatus: { completed: 6, unmatched: 0, memberCancelled: 0, volunteerCancelled: 0 },
      roundTrips: { completed: 0, unmatched: 0, memberCancelled: 0, volunteerCancelled: 0 } },
  ],
}

// GET /metrics/persons. Villages match PAYLOAD: 1 Warwick, 2 Barrington.
const PERSONS = {
  range: { start: '2026-01-01', end: '2026-12-31' },
  members: [
    { personId: '11', fullName: 'Idle, Ida', villageId: '1', status: 'Active', count: 0, completedRoundTrips: 0 },
    { personId: '12', fullName: 'Busy, Bo', villageId: '2', status: 'Active', count: 12, completedRoundTrips: 3 },
    { personId: '13', fullName: 'Gone, Gus', villageId: '1', status: 'Dropped', count: 2, completedRoundTrips: 0 },
  ],
  volunteers: [
    { personId: '21', fullName: 'Driver, Dee', villageId: '2', status: 'Active', count: 40, completedRoundTrips: 20 },
    { personId: '22', fullName: 'Former, Fay', villageId: '1', status: 'Dropped', count: 1, completedRoundTrips: 0 },
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
  toastAdd.mockClear()
  getMetaMetrics.mockReset()
  getMetaMetrics.mockResolvedValue(PAYLOAD)
  getMetaMetricsPersons.mockReset()
  getMetaMetricsPersons.mockResolvedValue(PERSONS)
  buildMetaMetricsPdf.mockClear()
  downloadCsv.mockClear()
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
    const firstRow = villageRows(container)[0]
    expect(firstRow.textContent).toContain('Barrington')
    expect(firstRow.textContent).toContain('13')
  })

  it('writes the view to the URL when Share is chosen', async () => {
    getMetaMetrics.mockResolvedValue(PAYLOAD)
    mountPage()
    await waitFor(() => expect(screen.getByText('Percent')).toBeInTheDocument())
    await fireEvent.click(screen.getByText('Percent'))
    await waitFor(() => expect(mockRoute.query.view).toBe('percent'))
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
    mockRoute.query = { start: '2026-01-01', end: '2026-12-31', view: 'percent' }
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

  it('renders category columns and a composed bar on the Categories tab', async () => {
    mockRoute.query = { start: '2026-01-01', end: '2026-12-31', tab: 'categories' }
    const { container } = mountPage()
    await waitFor(() => expect(villageOrder(container).length).toBe(2))
    expect(screen.getByText('Rides')).toBeInTheDocument()
    expect(screen.getByText('Errands')).toBeInTheDocument()
    // One composed bar per row, its segments in series order.
    expect(container.querySelectorAll('.bar-track')[0].querySelectorAll('.bar-seg').length)
      .toBeGreaterThan(0)
  })

  it('counts completed work only on the Categories tab', async () => {
    mockRoute.query = { start: '2026-01-01', end: '2026-12-31', tab: 'categories' }
    const { container } = mountPage()
    await waitFor(() => expect(villageOrder(container).length).toBe(2))
    // Warwick rides: medical 8 + 2 round trips, plus shopping 6 = 16.
    // Errands 4. Its 5 unmatched and 3 cancelled are NOT work done.
    const warwick = villageRows(container).find(tr => tr.textContent.includes('Warwick'))
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
    // One composed bar per row, since the services partition their category.
    expect(container.querySelectorAll('.bar-track')[0].querySelectorAll('.bar-seg').length)
      .toBeGreaterThan(0)
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

    await fireEvent.click(screen.getByText('Percent'))
    await waitFor(() => expect(mockRoute.query.view).toBe('percent'))
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

  // `onError: null` used to silence EVERY failure, not just the 403 it was
  // written for. A 500 on a range change then left the previous range's numbers
  // on screen under the newly-chosen dates, with nothing to say the fetch had
  // failed. The 403 stays inline; everything else is loud.
  describe('fetch failures', () => {
    const httpError = (status) => Object.assign(new Error(`HTTP ${status}`), {
      status, response: { status },
    })

    it('toasts a server error rather than failing silently', async () => {
      getMetaMetrics.mockRejectedValueOnce(httpError(500))
      mountPage()
      await waitFor(() => expect(toastAdd).toHaveBeenCalledTimes(1))
      expect(toastAdd.mock.calls[0][0]).toMatchObject({ severity: 'error' })
    })

    it('leaves a 403 to the inline denial notice, with no toast', async () => {
      // No granted villages is an expected state, not a failure to report.
      getMetaMetrics.mockRejectedValueOnce(httpError(403))
      mountPage()
      await waitFor(() => expect(getMetaMetrics).toHaveBeenCalled())
      await Promise.resolve()
      expect(toastAdd).not.toHaveBeenCalled()
    })
  })
})

describe('People tab', () => {
  const peopleQuery = (extra = {}) => ({ start: '2026-01-01', end: '2026-12-31', tab: 'people', ...extra })
  const memberNames = (container) =>
    [...container.querySelectorAll('.people-members tbody tr td:first-child .person-name')].map(td => td.textContent.trim())
  const volunteerNames = (container) =>
    [...container.querySelectorAll('.people-volunteers tbody tr td:first-child .person-name')].map(td => td.textContent.trim())

  it('offers a People tab', async () => {
    await mountLoaded()
    expect(screen.getByRole('tab', { name: 'People' })).toBeInTheDocument()
  })

  it('fetches nothing until a village is chosen, and says so', async () => {
    mockRoute.query = peopleQuery()
    await mountLoaded()
    expect(screen.getByText(/choose a village/i, { selector: 'p.notice' })).toBeInTheDocument()
    expect(getMetaMetricsPersons).not.toHaveBeenCalled()
  })

  it('never fetches persons while another tab is showing', async () => {
    mockRoute.query = { start: '2026-01-01', end: '2026-12-31', village: '1' }
    await mountLoaded()
    expect(getMetaMetricsPersons).not.toHaveBeenCalled()
  })

  it('fetches one village when one is chosen', async () => {
    mockRoute.query = peopleQuery({ village: '1' })
    await mountLoaded()
    await waitFor(() => expect(getMetaMetricsPersons).toHaveBeenCalledWith('2026-01-01', '2026-12-31', '1'))
  })

  it('fetches every village for All, and adds a Village column', async () => {
    mockRoute.query = peopleQuery({ village: 'all' })
    const { container } = await mountLoaded()
    await waitFor(() => expect(getMetaMetricsPersons).toHaveBeenCalledWith('2026-01-01', '2026-12-31', undefined))
    await waitFor(() => expect(memberNames(container).length).toBe(3))
    expect(container.querySelector('.people-members thead').textContent).toMatch(/village/i)
    expect(container.querySelector('.people-members tbody').textContent).toContain('Barrington')
  })

  it('omits the Village column for a single village', async () => {
    mockRoute.query = peopleQuery({ village: '1' })
    const { container } = await mountLoaded()
    await waitFor(() => expect(memberNames(container).length).toBe(3))
    expect(container.querySelector('.people-members thead').textContent).not.toMatch(/village/i)
  })

  it('lists members and volunteers, busiest first, round trips counted twice', async () => {
    mockRoute.query = peopleQuery({ village: 'all' })
    const { container } = await mountLoaded()
    await waitFor(() => expect(memberNames(container).length).toBe(3))
    expect(memberNames(container)).toEqual(['Busy, Bo', 'Gone, Gus', 'Idle, Ida'])
    expect(volunteerNames(container)).toEqual(['Driver, Dee', 'Former, Fay'])
    // 12 + 3 round trips
    expect(container.querySelector('.people-members tbody tr').textContent).toContain('15')
  })

  it('reverses the order on a second header click', async () => {
    mockRoute.query = peopleQuery({ village: 'all' })
    const { container } = await mountLoaded()
    await waitFor(() => expect(memberNames(container).length).toBe(3))
    const header = container.querySelector('.people-members th.count-col')
    await fireEvent.click(header)
    expect(memberNames(container)).toEqual(['Idle, Ida', 'Gone, Gus', 'Busy, Bo'])
  })

  it('narrows both lists to the chosen activity range', async () => {
    mockRoute.query = peopleQuery({ village: 'all', activity: '0' })
    const { container } = await mountLoaded()
    await waitFor(() => expect(memberNames(container)).toEqual(['Idle, Ida']))
    expect(volunteerNames(container)).toEqual([])
  })

  it('writes the activity range to the URL without refetching', async () => {
    mockRoute.query = peopleQuery({ village: 'all' })
    await mountLoaded()
    await waitFor(() => expect(getMetaMetricsPersons).toHaveBeenCalledTimes(1))
    await fireEvent.click(screen.getByText('50+'))
    await waitFor(() => expect(mockRoute.query.activity).toBe('50plus'))
    expect(getMetaMetricsPersons).toHaveBeenCalledTimes(1)
  })

  it('tags people who are no longer active', async () => {
    mockRoute.query = peopleQuery({ village: 'all' })
    const { container } = await mountLoaded()
    await waitFor(() => expect(memberNames(container).length).toBe(3))
    expect(container.querySelector('.people-members').textContent).toContain('Dropped')
    expect(container.querySelector('.people-volunteers').textContent).toContain('Dropped')
  })

  it('refetches when the range changes', async () => {
    mockRoute.query = peopleQuery({ village: '1' })
    await mountLoaded()
    await waitFor(() => expect(getMetaMetricsPersons).toHaveBeenCalledTimes(1))
    mockRoute.query = { ...mockRoute.query, start: '2025-01-01', end: '2025-12-31' }
    await waitFor(() => expect(getMetaMetricsPersons).toHaveBeenLastCalledWith('2025-01-01', '2025-12-31', '1'))
  })

  it('offers one download per list', async () => {
    mockRoute.query = peopleQuery({ village: 'all' })
    const { container } = await mountLoaded()
    await waitFor(() => expect(memberNames(container).length).toBe(3))
    for (const cls of ['.people-members', '.people-volunteers']) {
      expect([...container.querySelector(cls).querySelectorAll('button')]
        .filter(b => /download csv/i.test(b.textContent))).toHaveLength(1)
    }
  })

  it('puts each list\'s download on its heading line', async () => {
    mockRoute.query = peopleQuery({ village: 'all' })
    const { container } = await mountLoaded()
    await waitFor(() => expect(memberNames(container).length).toBe(3))
    for (const [cls, title] of [['.people-members', 'Members'], ['.people-volunteers', 'Volunteers']]) {
      const heading = [...container.querySelectorAll(`${cls} h3`)].find(h => h.textContent.includes(title))
      expect(heading, `${title} heading`).toBeTruthy()
      const button = [...container.querySelectorAll(`${cls} button`)].find(x => /download csv/i.test(x.textContent))
      expect(button.parentElement, `${title} download shares the heading's row`).toBe(heading.parentElement)
    }
  })

  it('downloads the list as shown: its village, bucket and order', async () => {
    mockRoute.query = peopleQuery({ village: 'all', activity: '1-49' })
    const { container } = await mountLoaded()
    await waitFor(() => expect(memberNames(container)).toEqual(['Busy, Bo', 'Gone, Gus']))
    const button = [...container.querySelector('.people-members').querySelectorAll('button')]
      .find(b => /download csv/i.test(b.textContent))
    await fireEvent.click(button)
    expect(downloadCsv).toHaveBeenCalledTimes(1)
    const [csv, filename] = downloadCsv.mock.calls[0]
    expect(csv.split('\n')).toEqual([
      'Member,Village,Status,Completed',
      '"Busy, Bo",Barrington,Active,15',
      '"Gone, Gus",Warwick,Dropped,2',
    ])
    expect(filename).toBe('tvcri-people-all-villages-members-1-49-2026-01-01-2026-12-31.csv')
  })

  it('hides the Counts/Percent toggle and the tab-strip CSV', async () => {
    mockRoute.query = peopleQuery()
    const { container } = await mountLoaded()
    expect(screen.queryByText('Percent')).toBeNull()
    expect(container.querySelector('.tabs-csv')).toBeNull()
  })

  it('leaves the PDF to the three matrix tabs', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:x')
    URL.revokeObjectURL = vi.fn()
    mockRoute.query = peopleQuery()
    await mountLoaded()
    await fireEvent.click(screen.getByText(/download pdf/i))
    await waitFor(() => expect(buildMetaMetricsPdf).toHaveBeenCalled())
    const keys = buildMetaMetricsPdf.mock.calls[0][0].sections.map(s => s.key)
    expect(keys).toEqual(['outcomes', 'categories', 'detail'])
  })
})
