// @vitest-environment jsdom
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/vue'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { reactive, nextTick } from 'vue'
import PrimeVue from 'primevue/config'

// --- module mocks (must be declared before importing the component under test) ---
// mockRoute is REACTIVE and mockRouter.replace WRITES BACK into it, assigning a brand new
// query object exactly as vue-router 4 does per navigation. An inert replace() that never
// mutates the route cannot observe query-driven re-renders or refetches, which is precisely
// how a green suite once missed "every tab click refetches".
const mockRoute = reactive({ params: {}, query: {} })

const mockRouter = {
  replace: vi.fn(({ query }) => {
    // fresh object per navigation — this is what invalidates route.query-derived computeds
    mockRoute.query = { ...query }
  }),
  push: vi.fn(),
}

vi.mock('vue-router', () => ({
  useRoute: () => mockRoute,
  useRouter: () => mockRouter,
}))

const getVillageMetrics = vi.fn()
vi.mock('../api/villageMetricsApi.js', () => ({
  getVillageMetrics: (...args) => getVillageMetrics(...args),
}))

const VillageMetrics = (await import('./VillageMetrics.vue')).default

// jsdom has no canvas; stub primevue/chart so MetricsPieCard mounts without touching it.
const ChartStub = { name: 'Chart', props: ['type', 'data', 'options'], template: '<canvas />' }

function byStatus (over = {}) {
  return {
    completed: 0,
    unmatched: 0,
    memberCancelled: 0,
    volunteerCancelled: 0,
    ...over,
  }
}

// totals: 10 completed + 4 round trips; 2 member-cancelled, 1 volunteer-cancelled.
const METRICS = {
  villageName: 'Testville',
  totals: {
    totalRequests: 13,
    byStatus: byStatus({ completed: 10, memberCancelled: 2, volunteerCancelled: 1 }),
    completedRoundTrips: 4,
  },
  byCategory: [
    { category: 'Rides', byStatus: byStatus({ completed: 6 }), completedRoundTrips: 4 },
    { category: 'Errands', byStatus: byStatus({ completed: 4 }), completedRoundTrips: 0 },
    { category: 'Home Help', byStatus: byStatus(), completedRoundTrips: 0 },
    { category: 'Tech Support', byStatus: byStatus(), completedRoundTrips: 0 },
    { category: 'Member Added', byStatus: byStatus(), completedRoundTrips: 0 },
  ],
  byServiceType: [
    { serviceName: 'Ride: Medical', category: 'Rides', byStatus: byStatus({ completed: 6 }), completedRoundTrips: 4 },
    { serviceName: 'Grocery run', category: 'Errands', byStatus: byStatus({ completed: 4 }), completedRoundTrips: 0 },
  ],
  byMember: [
    { personId: 1, fullName: 'Ada Member', count: 6, completedRoundTrips: 4 },
  ],
  byVolunteer: [
    { personId: 2, fullName: 'Bob Volunteer', count: 4, completedRoundTrips: 0 },
  ],
}

function renderPage () {
  return render(VillageMetrics, {
    global: {
      plugins: [PrimeVue],
      stubs: { Chart: ChartStub },
    },
  })
}

// Wait for the async fetch to resolve and the dashboard to paint.
async function renderLoaded () {
  const utils = renderPage()
  await waitFor(() => expect(screen.getByText('Round trip = 2 legs')).toBeTruthy())
  return utils
}

describe('VillageMetrics container', () => {
  beforeEach(() => {
    global.VG = {
      curUser: { permissions: { federation: ['*'], byVillage: {} } },
    }
    // PrimeVue's TabList observes its own width on mount; jsdom has no ResizeObserver.
    global.ResizeObserver = global.ResizeObserver || class {
      observe () {}
      unobserve () {}
      disconnect () {}
    }
    window.matchMedia = window.matchMedia || (query => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
    // reset the reactive route in place (it is a const reactive, not reassignable)
    mockRoute.params = { villageId: '1' }
    mockRoute.query = { start: '2026-01-01', end: '2026-12-31' }
    // mockClear, not mockReset: mockReset would strip replace()'s write-back implementation
    mockRouter.replace.mockClear()
    mockRouter.push.mockClear()
    getVillageMetrics.mockReset()
    getVillageMetrics.mockResolvedValue(METRICS)
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('fetches once on mount with the range from the query and renders the header', async () => {
    await renderLoaded()
    expect(getVillageMetrics).toHaveBeenCalledTimes(1)
    expect(getVillageMetrics).toHaveBeenCalledWith('1', '2026-01-01', '2026-12-31')
    expect(screen.getByText('Testville — Metrics')).toBeTruthy()
    // a valid range must not provoke a normalizing replace
    expect(mockRouter.replace).not.toHaveBeenCalled()
  })

  it('normalizes a missing range without dropping the tab query key', async () => {
    mockRoute.query = { tab: 'people' }
    renderPage()
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalled())
    const { query } = mockRouter.replace.mock.calls[0][0]
    expect(query.tab).toBe('people')
    expect(query.start).toBeTruthy()
    expect(query.end).toBeTruthy()
    // The write-back makes the range valid, so exactly one real fetch follows the
    // normalize — never two (no double-fetch, no replace loop).
    await waitFor(() => expect(getVillageMetrics).toHaveBeenCalledTimes(1))
    expect(getVillageMetrics).toHaveBeenCalledWith('1', query.start, query.end)
    expect(mockRouter.replace).toHaveBeenCalledTimes(1)
  })

  // --- regression: tab navigation must not refetch -------------------------------
  // `range` is a computed returning a new object literal each evaluation, and watch
  // compares non-deep sources with Object.is. Watching it refetched on EVERY navigation,
  // including tab-only ones. The container watches a primitive `rangeKey` instead.
  it('does not refetch when only the tab changes', async () => {
    await renderLoaded()
    expect(getVillageMetrics).toHaveBeenCalledTimes(1) // mount

    screen.getByText('People').click()
    await waitFor(() => expect(mockRoute.query.tab).toBe('people'))
    await nextTick()
    expect(getVillageMetrics).toHaveBeenCalledTimes(1) // still 1 — no refetch

    screen.getByText('Outcomes').click()
    await waitFor(() => expect(mockRoute.query.tab).toBe('outcomes'))
    await nextTick()
    expect(getVillageMetrics).toHaveBeenCalledTimes(1) // still 1 after a second click
  })

  it('does refetch when the range actually changes', async () => {
    await renderLoaded()
    expect(getVillageMetrics).toHaveBeenCalledTimes(1)

    // simulate the range picker emitting a new range through the same router path
    mockRoute.query = { ...mockRoute.query, start: '2025-01-01', end: '2025-12-31' }
    await waitFor(() => expect(getVillageMetrics).toHaveBeenCalledTimes(2))
    expect(getVillageMetrics).toHaveBeenLastCalledWith('1', '2025-01-01', '2025-12-31')
  })

  it('applies the legs bump to the summary strip by default (toggle ON)', async () => {
    await renderLoaded()
    // requests 13 + 4 roundtrips = 17; completed 10 + 4 = 14; cancelled 2 + 1 = 3
    expect(screen.getByText('17')).toBeTruthy()
    expect(screen.getAllByText('14').length).toBeGreaterThan(0)
    expect(screen.getAllByText('3').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Rides').length).toBeGreaterThan(0) // top category
  })

  it('renders the categories pie legend with legs-adjusted completed counts', async () => {
    await renderLoaded()
    // Rides completed 6 + 4 roundtrips = 10, Errands 4 → 10/14 ≈ 71%, 4/14 ≈ 29%
    expect(screen.getAllByText('10').length).toBeGreaterThan(0)
    expect(screen.getAllByText('71%').length).toBeGreaterThan(0)
    expect(screen.getAllByText('29%').length).toBeGreaterThan(0)
  })

  it('turning the legs toggle off removes the round-trip bump', async () => {
    const { container } = await renderLoaded()
    const input = container.querySelector('#legsToggle')
    expect(input).toBeTruthy()
    input.click()
    // completed 10 (no bump), requests 13
    await waitFor(() => expect(screen.getByText('13')).toBeTruthy())
    expect(screen.getAllByText('10').length).toBeGreaterThan(0)
  })

  it('People panel shows legs-adjusted member counts and plain volunteer counts', async () => {
    mockRoute.query = { start: '2026-01-01', end: '2026-12-31', tab: 'people' }
    await renderLoaded()
    expect(screen.getByText('Ada Member')).toBeTruthy()
    expect(screen.getByText('Bob Volunteer')).toBeTruthy()
    // Ada: 6 + 4 roundtrips = 10; Bob: 4 + 0 = 4
    expect(screen.getAllByText('10').length).toBeGreaterThan(0)
    expect(screen.getAllByText('4').length).toBeGreaterThan(0)
  })

  it('honors a valid ?tab= on entry and falls back to categories for a bogus value', async () => {
    mockRoute.query = { start: '2026-01-01', end: '2026-12-31', tab: 'outcomes' }
    const { unmount } = await renderLoaded()
    // Outcomes pie rows include the cancellation buckets
    expect(screen.getByText('Volunteer cancelled')).toBeTruthy()
    unmount()
    cleanup()

    mockRoute.query = { start: '2026-01-01', end: '2026-12-31', tab: 'bogus' }
    await renderLoaded()
    // categories panel is active: its status Select label is present
    expect(screen.getAllByText('Status').length).toBeGreaterThan(0)
    // and a bogus value is not corrected via a router.replace
    expect(mockRouter.replace).not.toHaveBeenCalled()
  })

  it('changing tabs replaces the query while preserving start/end', async () => {
    await renderLoaded()
    screen.getByText('People').click()
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalled())
    const { query } = mockRouter.replace.mock.calls.at(-1)[0]
    expect(query).toMatchObject({ start: '2026-01-01', end: '2026-12-31', tab: 'people' })
  })

  it('offers a CSV download on the visible legend table', async () => {
    await renderLoaded()
    const buttons = screen.getAllByRole('button', { name: /download csv/i })
    expect(buttons.length).toBeGreaterThan(0)
  })

  it('offers a Download PDF button', async () => {
    await renderLoaded()
    expect(screen.getByRole('button', { name: /download pdf/i })).toBeTruthy()
  })

  // The JSON item lives in the SplitButton's dropdown, which PrimeVue renders
  // only once opened — so drive it through the toggle rather than asserting on
  // markup that isn't mounted yet.
  it('offers Download JSON in the export dropdown', async () => {
    await renderLoaded()
    const toggle = document.querySelector('.p-splitbutton-dropdown')
    expect(toggle).not.toBeNull()

    await fireEvent.click(toggle)
    await waitFor(() => expect(screen.getByText('Download JSON')).toBeTruthy())
  })

  // The raw payload is exported unfiltered: no status/category selection and no
  // legs doubling, since those are client-side readings of this same JSON.
  it('downloads the unmodified API payload as JSON', async () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    // jsdom's Blob has no .text(), so capture the serialized parts on the way in.
    const captured = []
    const RealBlob = globalThis.Blob
    globalThis.Blob = class extends RealBlob {
      constructor (parts, opts) { super(parts, opts); captured.push({ parts, type: opts?.type }) }
    }
    const origCreate = URL.createObjectURL
    URL.createObjectURL = () => 'blob:stub'
    URL.revokeObjectURL = () => {}

    await renderLoaded()
    await fireEvent.click(document.querySelector('.p-splitbutton-dropdown'))
    await waitFor(() => expect(screen.getByText('Download JSON')).toBeTruthy())
    await fireEvent.click(screen.getByText('Download JSON'))

    const json = captured.find(c => c.type === 'application/json')
    expect(json).toBeTruthy()
    expect(JSON.parse(json.parts[0])).toEqual(METRICS)

    globalThis.Blob = RealBlob
    URL.createObjectURL = origCreate
    clickSpy.mockRestore()
  })
})
