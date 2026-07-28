// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/vue'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import PrimeVue from 'primevue/config'
import MetaServiceRequestList from '../components/MetaServiceRequestList.vue'
import { downloadCsv } from '../../../shared/lib/csvUtils.js'

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn(), afterEach: () => () => {} }),
  useRoute: () => ({ params: {} })
}))

vi.mock('primevue/usetoast', () => ({
  useToast: () => ({ add: vi.fn() })
}))

vi.mock('../../../shared/composables/useCurrentUser.js', () => ({
  useCurrentUser: () => ({ hasPermission: () => true })
}))

vi.mock('../api/serviceRequestApi.js', () => ({
  getServiceRequests: vi.fn().mockResolvedValue([
    {
      serviceRequestId: 1,
      displayNumber: 101,
      status: 'Open',
      serviceName: 'Ride to Clinic',
      memberFullName: 'Alice Anderson',
      volunteerFullName: 'Vera Volunteer',
      serviceDate: '2026-07-20',
      city: 'Springfield',
      villageName: 'Testville',
      createdAt: '2026-07-01T12:00:00Z',
      vssSignup: true
    },
    {
      serviceRequestId: 2,
      displayNumber: 202,
      status: 'Confirmed',
      serviceName: 'Grocery Run',
      memberFullName: 'Bob Baker',
      volunteerFullName: 'Wally Volunteer',
      serviceDate: '2026-07-21',
      city: 'Springfield',
      villageName: 'Testville',
      createdAt: '2026-07-02T12:00:00Z',
      vssSignup: false
    }
  ]),
  getServiceRequest: vi.fn(),
  updateServiceRequest: vi.fn()
}))

vi.mock('../../VillageList/api/villageApi.js', () => ({
  getVillages: vi.fn().mockResolvedValue([])
}))

vi.mock('../../../shared/api/analyticsApi.js', () => ({
  postAnalyticsEvents: vi.fn().mockResolvedValue(undefined)
}))

vi.mock('../../../shared/lib/csvUtils.js', async (importOriginal) => ({
  ...(await importOriginal()),
  downloadCsv: vi.fn()
}))

describe('MetaServiceRequestList CSV download', () => {
  beforeEach(() => {
    // NOT clearAllMocks: that would strip the getServiceRequests mock
    // implementation and every fetch would resolve undefined.
    vi.mocked(downloadCsv).mockClear()
    // jsdom has no matchMedia; PrimeVue Select uses it on mount
    window.matchMedia = () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {}
    })
    // jsdom has no ResizeObserver; PrimeVue TabList observes its tabs on mount
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
    const { getServiceRequests } = await import('../api/serviceRequestApi.js')
    getServiceRequests.mockClear()
    render(MetaServiceRequestList, { global: { plugins: [PrimeVue] } })
    await waitFor(() => expect(getServiceRequests).toHaveBeenCalled())
    const params = getServiceRequests.mock.calls[0][0]
    expect(params.status).toEqual(['open', 'confirmed', 'completed', 'unmatched', 'cancelled'])
    expect(params.status).not.toContain('draft')
    expect(params.serviceDateEnd).toBeUndefined()
  })

  it('renders no tab list', async () => {
    const { queryByRole } = render(MetaServiceRequestList, { global: { plugins: [PrimeVue] } })
    await waitFor(() => expect(queryByRole('tablist')).toBeNull())
  })

  it('shows only open and confirmed rows on first load', async () => {
    const { getServiceRequests } = await import('../api/serviceRequestApi.js')
    getServiceRequests.mockResolvedValueOnce([
      { serviceRequestId: 1, displayNumber: 'M-1', status: 'Open', serviceDate: '2026-07-20' },
      { serviceRequestId: 2, displayNumber: 'M-2', status: 'Completed', serviceDate: '2026-07-19' }
    ])
    // ServiceRequestTable renders both a desktop DataTable and a
    // mobile-only card list for the same rows, so text appears twice.
    const { findAllByText, queryAllByText } = render(MetaServiceRequestList, { global: { plugins: [PrimeVue] } })
    await findAllByText('M-1')
    expect(queryAllByText('M-2')).toHaveLength(0)
  })

  it('shows an x-of-y count reflecting the default status filter', async () => {
    const { getServiceRequests } = await import('../api/serviceRequestApi.js')
    getServiceRequests.mockResolvedValueOnce([
      { serviceRequestId: 1, displayNumber: 'M-1', status: 'Open', serviceDate: '2026-07-20' },
      { serviceRequestId: 2, displayNumber: 'M-2', status: 'Completed', serviceDate: '2026-07-19' }
    ])
    const { findByText } = render(MetaServiceRequestList, { global: { plugins: [PrimeVue] } })
    expect(await findByText(/1 of 2 requests/)).toBeTruthy()
  })

  it('downloads only the rows matching the active ID filter', async () => {
    render(MetaServiceRequestList, { global: { plugins: [PrimeVue] } })

    await screen.findAllByText('Alice Anderson')
    expect(screen.getAllByText('Bob Baker').length).toBeGreaterThan(0)

    // expand the collapsed filters panel, then filter by request number
    await fireEvent.click(screen.getByText('Filters'))
    const idInput = screen.getByPlaceholderText('Search by #')
    await fireEvent.update(idInput, '101')

    await waitFor(() => expect(screen.queryAllByText('Bob Baker')).toHaveLength(0))

    await fireEvent.click(screen.getByText('Download'))

    await waitFor(() => expect(downloadCsv).toHaveBeenCalled())
    const [csv, filename] = downloadCsv.mock.calls[0]
    expect(filename).toBe('service-requests.csv')
    expect(csv).toContain('Alice Anderson')
    expect(csv).not.toContain('Bob Baker')
  })

  it('narrows the visible rows by status without refetching', async () => {
    const { getServiceRequests } = await import('../api/serviceRequestApi.js')
    render(MetaServiceRequestList, { global: { plugins: [PrimeVue] } })

    await screen.findAllByText('Alice Anderson')
    getServiceRequests.mockClear()

    // Alice is Open, Bob is Confirmed. The default status selection is
    // open+confirmed, so both checkboxes start checked; unchecking Open
    // narrows to Confirmed only.
    await fireEvent.click(screen.getByText('Filters'))
    await fireEvent.click(screen.getByLabelText('Open'))

    await waitFor(() => expect(screen.queryAllByText('Alice Anderson')).toHaveLength(0))
    expect(screen.getAllByText('Bob Baker').length).toBeGreaterThan(0)
    // Client-side: narrowing must not hit the network.
    expect(getServiceRequests).not.toHaveBeenCalled()
  })

  it('shows only VSS signup rows when the VSS Signup checkbox is checked', async () => {
    render(MetaServiceRequestList, { global: { plugins: [PrimeVue] } })

    // rows render twice (desktop table + mobile cards), hence getAllByText
    await screen.findAllByText('Alice Anderson')
    expect(screen.getAllByText('Bob Baker').length).toBeGreaterThan(0)

    await fireEvent.click(screen.getByText('Filters'))
    await fireEvent.click(screen.getByLabelText('VSS Signup'))

    await waitFor(() => expect(screen.queryAllByText('Bob Baker')).toHaveLength(0))
    expect(screen.getAllByText('Alice Anderson').length).toBeGreaterThan(0)
  })
})
