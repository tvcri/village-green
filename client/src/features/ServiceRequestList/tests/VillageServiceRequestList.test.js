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

vi.mock('../api/serviceRequestApi.js', () => ({
  getVillageServiceRequests: vi.fn().mockResolvedValue([
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
  ]),
  getServiceRequest: vi.fn(),
  updateServiceRequest: vi.fn()
}))

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
    vi.clearAllMocks()
    // jsdom has no matchMedia; PrimeVue Select uses it on mount
    window.matchMedia = () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {}
    })
  })

  it('downloads only the rows matching the active status filter', async () => {
    render(VillageServiceRequestList, { global: { plugins: [PrimeVue] } })

    // default status filter is ['open', 'confirmed'], so the completed
    // request is hidden from the table from the start
    await screen.findAllByText('Alice Anderson')
    expect(screen.queryAllByText('Bob Baker')).toHaveLength(0)

    await fireEvent.click(screen.getByText('Download'))

    await waitFor(() => expect(downloadCsv).toHaveBeenCalled())
    const [csv, filename] = downloadCsv.mock.calls[0]
    expect(filename).toBe('Testville-service-requests.csv')
    expect(csv).toContain('Alice Anderson')
    expect(csv).not.toContain('Bob Baker')
  })
})
