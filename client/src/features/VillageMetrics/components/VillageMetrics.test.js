// @vitest-environment jsdom
import { render, screen, cleanup, waitFor } from '@testing-library/vue'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import PrimeVue from 'primevue/config'

// --- module mocks (must be declared before importing the component under test) ---
const mockRouter = { replace: vi.fn(), push: vi.fn() }
let mockRoute

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
    draft: 0,
    open: 0,
    confirmed: 0,
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
  await waitFor(() => expect(screen.getByText('Count round trips as 2 legs')).toBeTruthy())
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
    mockRoute = {
      params: { villageId: '1' },
      query: { start: '2026-01-01', end: '2026-12-31' },
    }
    mockRouter.replace.mockReset()
    mockRouter.push.mockReset()
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
    // no fetch until the range is valid
    expect(getVillageMetrics).not.toHaveBeenCalled()
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
})
