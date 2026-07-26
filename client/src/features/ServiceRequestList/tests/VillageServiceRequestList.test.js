// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/vue'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import PrimeVue from 'primevue/config'
import VillageServiceRequestList from '../components/VillageServiceRequestList.vue'
import { downloadCsv } from '../../../shared/lib/csvUtils.js'

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn(), afterEach: () => () => {} }),
  useRoute: () => ({ params: { villageId: '42' } })
}))

vi.mock('primevue/usetoast', () => ({
  useToast: () => ({ add: vi.fn() })
}))

// Status filtering is now the SERVER's job (the tab picks the status set), so
// the mock honours the requested statuses instead of returning everything.
// Rows are declared inside the factory because vi.mock is hoisted.
vi.mock('../api/serviceRequestApi.js', () => {
  const allRows = [
    {
      serviceRequestId: 1,
      displayNumber: 101,
      status: 'open',
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
      status: 'completed',
      serviceName: 'Grocery Run',
      memberFullName: 'Bob Baker',
      volunteerFullName: 'Wally Volunteer',
      serviceDate: '2026-07-21',
      city: 'Springfield',
      createdAt: '2026-07-02T12:00:00Z'
    }
  ]
  return {
    getVillageServiceRequests: vi.fn((_villageId, params = {}) =>
      Promise.resolve(
        params.status?.length
          ? allRows.filter(r => params.status.includes(r.status))
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

  it('fetches the Active tab on mount with open+confirmed', async () => {
    const { getVillageServiceRequests } = await import('../api/serviceRequestApi.js')
    getVillageServiceRequests.mockClear()
    render(VillageServiceRequestList, { global: { plugins: [PrimeVue] } })
    await waitFor(() => expect(getVillageServiceRequests).toHaveBeenCalled())
    const params = getVillageServiceRequests.mock.calls[0][1]
    expect(params.status).toEqual(['open', 'confirmed'])
    expect(params.status).not.toContain('draft')
    expect(params.serviceDateEnd).toBeUndefined()
  })

  it('downloads only the rows the Active tab fetched', async () => {
    render(VillageServiceRequestList, { global: { plugins: [PrimeVue] } })

    // The Active tab requests open+confirmed, so the completed request is
    // never fetched — the server, not a client filter, excludes it.
    await screen.findAllByText('Alice Anderson')
    expect(screen.queryAllByText('Bob Baker')).toHaveLength(0)

    // Both tab panels render an ExportButton, so target the visible one.
    await fireEvent.click(screen.getAllByText('Download')[0])

    await waitFor(() => expect(downloadCsv).toHaveBeenCalled())
    const [csv, filename] = downloadCsv.mock.calls[0]
    expect(filename).toBe('Testville-service-requests.csv')
    expect(csv).toContain('Alice Anderson')
    expect(csv).not.toContain('Bob Baker')
  })
})
