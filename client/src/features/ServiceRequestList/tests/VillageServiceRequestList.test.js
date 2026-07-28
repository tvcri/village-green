// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/vue'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { reactive } from 'vue'
import PrimeVue from 'primevue/config'
import VillageServiceRequestList from '../components/VillageServiceRequestList.vue'
import { downloadCsv } from '../../../shared/lib/csvUtils.js'

// `params` is reactive so a test can drive village navigation, which the
// component watches. Tests that don't navigate see a stable villageId of '42'.
const routeParams = reactive({ villageId: '42' })

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn(), afterEach: () => () => {} }),
  useRoute: () => ({ params: routeParams })
}))

vi.mock('primevue/usetoast', () => ({
  useToast: () => ({ add: vi.fn() })
}))

// The mock honours the requested `status` param (mirroring the real API's
// server-side date-window narrowing) so the "fetches every status" test can
// assert on it; client-side status filtering itself is exercised through the
// component, not this mock. Rows are declared inside the factory because
// vi.mock is hoisted.
vi.mock('../api/serviceRequestApi.js', () => {
  const allRows = [
    {
      serviceRequestId: 1,
      displayNumber: 101,
      status: 'Open',
      serviceName: 'Ride to Clinic',
      memberFullName: 'Alice Anderson',
      volunteerFullName: 'Vera Volunteer',
      serviceDate: '2026-07-20',
      city: 'Springfield',
      createdAt: '2026-07-01T12:00:00Z'
    },
    {
      serviceRequestId: 2,
      displayNumber: 102,
      status: 'Completed',
      serviceName: 'Grocery Run',
      memberFullName: 'Bob Baker',
      volunteerFullName: 'Wally Volunteer',
      serviceDate: '2026-07-21',
      city: 'Springfield',
      createdAt: '2026-07-02T12:00:00Z'
    }
  ]
  return {
    // Rows carry the raw DB status ('Open'); the status param is lowercase.
    getVillageServiceRequests: vi.fn((_villageId, params = {}) =>
      Promise.resolve(
        params.status?.length
          ? allRows.filter(r => params.status.includes(r.status.toLowerCase()))
          : allRows
      )
    ),
    getServiceRequest: vi.fn(),
    updateServiceRequest: vi.fn()
  }
})

vi.mock('../../../shared/api/apiClient.js', async (importOriginal) => ({
  ...(await importOriginal()),
  apiCall: vi.fn().mockResolvedValue({ name: 'Testville' })
}))

vi.mock('../../../shared/api/analyticsApi.js', () => ({
  postAnalyticsEvents: vi.fn().mockResolvedValue(undefined)
}))

vi.mock('../../../shared/lib/csvUtils.js', async (importOriginal) => ({
  ...(await importOriginal()),
  downloadCsv: vi.fn()
}))

describe('VillageServiceRequestList CSV download', () => {
  beforeEach(() => {
    // NOT clearAllMocks: that would strip the getVillageServiceRequests
    // factory implementation and every fetch would resolve undefined.
    vi.mocked(downloadCsv).mockClear()
    // routeParams is module-scoped, so a navigation test would leak into later ones
    routeParams.villageId = '42'
    // jsdom has no matchMedia; PrimeVue Select uses it on mount
    window.matchMedia = () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {}
    })
    // jsdom has no ResizeObserver; various PrimeVue components (e.g.
    // MultiSelect, AutoComplete) observe their elements on mount
    globalThis.ResizeObserver = class {
      observe () {}
      unobserve () {}
      disconnect () {}
    }
  })

  // vitest `globals` is off in vite.config.js, so Testing Library's automatic
  // cleanup never registers and mounted components leak between tests.
  afterEach(() => { cleanup() })

  it('fetches every status on mount over the default 30-day window', async () => {
    const { getVillageServiceRequests } = await import('../api/serviceRequestApi.js')
    getVillageServiceRequests.mockClear()
    render(VillageServiceRequestList, { global: { plugins: [PrimeVue] } })
    await waitFor(() => expect(getVillageServiceRequests).toHaveBeenCalled())
    const params = getVillageServiceRequests.mock.calls[0][1]
    expect(params.status).toEqual(['open', 'confirmed', 'completed', 'unmatched', 'cancelled'])
    expect(params.status).not.toContain('draft')
    expect(params.serviceDateEnd).toBeUndefined()
    expect(params.serviceDateStart).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('renders no tab list', async () => {
    const { queryByRole } = render(VillageServiceRequestList, { global: { plugins: [PrimeVue] } })
    await waitFor(() => expect(queryByRole('tablist')).toBeNull())
  })

  it('shows only open and confirmed rows on first load', async () => {
    const { getVillageServiceRequests } = await import('../api/serviceRequestApi.js')
    getVillageServiceRequests.mockResolvedValueOnce([
      { serviceRequestId: 1, displayNumber: 'V-1', status: 'Open', serviceDate: '2026-07-20' },
      { serviceRequestId: 2, displayNumber: 'V-2', status: 'Completed', serviceDate: '2026-07-19' },
      { serviceRequestId: 3, displayNumber: 'V-3', status: 'Member cancelled', serviceDate: '2026-07-18' }
    ])
    // ServiceRequestTable renders both a desktop DataTable and a
    // mobile-only card list for the same rows, so text appears twice.
    const { findAllByText, queryAllByText } = render(VillageServiceRequestList, { global: { plugins: [PrimeVue] } })
    await findAllByText('V-1')
    expect(queryAllByText('V-2')).toHaveLength(0)
    expect(queryAllByText('V-3')).toHaveLength(0)
  })

  it('shows an x-of-y count reflecting the default status filter', async () => {
    const { getVillageServiceRequests } = await import('../api/serviceRequestApi.js')
    getVillageServiceRequests.mockResolvedValueOnce([
      { serviceRequestId: 1, displayNumber: 'V-1', status: 'Open', serviceDate: '2026-07-20' },
      { serviceRequestId: 2, displayNumber: 'V-2', status: 'Completed', serviceDate: '2026-07-19' }
    ])
    const { findByText } = render(VillageServiceRequestList, { global: { plugins: [PrimeVue] } })
    expect(await findByText(/Showing 1 of 2/)).toBeTruthy()
  })

  it('clearing filters reveals closed rows and resets the date window', async () => {
    const { getVillageServiceRequests } = await import('../api/serviceRequestApi.js')
    getVillageServiceRequests.mockResolvedValueOnce([
      { serviceRequestId: 1, displayNumber: 'V-1', status: 'Open', serviceDate: '2026-07-20' },
      { serviceRequestId: 2, displayNumber: 'V-2', status: 'Completed', serviceDate: '2026-07-19' }
    ])
    const { findAllByText, queryAllByText, container } = render(VillageServiceRequestList, { global: { plugins: [PrimeVue] } })

    await findAllByText('V-1')
    expect(queryAllByText('V-2')).toHaveLength(0)

    const fromInput = container.querySelector('#window-start')
    const defaultFrom = fromInput.value
    await fireEvent.update(fromInput, '2026-06-01')
    expect(fromInput.value).toBe('2026-06-01')

    // The clear button only renders once activeFilterCount > 0 (the window
    // narrowing above guarantees that); its tooltip text lives in a
    // hover-triggered portal, not static DOM text, so target it by icon.
    const clearButton = container.querySelector('button .pi-times')?.closest('button')
    expect(clearButton).toBeTruthy()
    await fireEvent.click(clearButton)

    await waitFor(() => expect(queryAllByText('V-2').length).toBeGreaterThan(0))
    expect(queryAllByText('V-1').length).toBeGreaterThan(0)
    expect(fromInput.value).toBe(defaultFrom)
  })

  it('keeps the open+confirmed default when navigating to another village', async () => {
    // A village switch is a fresh load, not a "clear filters" click: clearing
    // the member/volunteer/service filters is right, but dropping the status
    // default would silently show cancelled and completed work in village B
    // after village A showed only active work.
    const { getVillageServiceRequests } = await import('../api/serviceRequestApi.js')
    render(VillageServiceRequestList, { global: { plugins: [PrimeVue] } })
    await screen.findAllByText('Alice Anderson')
    expect(screen.queryAllByText('Bob Baker')).toHaveLength(0)

    getVillageServiceRequests.mockClear()
    routeParams.villageId = '99'
    // The refetch confirms the village watcher actually ran; without it this
    // test would pass vacuously on the pre-navigation render.
    await waitFor(() => expect(getVillageServiceRequests).toHaveBeenCalled())
    expect(getVillageServiceRequests.mock.calls[0][0]).toBe('99')

    // Bob is Completed. If the watcher left selectedStatuses empty, every
    // status would show and Bob would appear.
    await waitFor(() => expect(screen.queryAllByText('Alice Anderson').length).toBeGreaterThan(0))
    expect(screen.queryAllByText('Bob Baker')).toHaveLength(0)
  })

  it('downloads only the rows visible under the default status filter', async () => {
    render(VillageServiceRequestList, { global: { plugins: [PrimeVue] } })

    // Every status is fetched now, but the default status filter
    // (open+confirmed) hides the completed request client-side.
    await screen.findAllByText('Alice Anderson')
    expect(screen.queryAllByText('Bob Baker')).toHaveLength(0)

    await fireEvent.click(screen.getAllByText('Download')[0])

    await waitFor(() => expect(downloadCsv).toHaveBeenCalled())
    const [csv, filename] = downloadCsv.mock.calls[0]
    expect(filename).toBe('Testville-service-requests.csv')
    expect(csv).toContain('Alice Anderson')
    expect(csv).not.toContain('Bob Baker')
  })
})
