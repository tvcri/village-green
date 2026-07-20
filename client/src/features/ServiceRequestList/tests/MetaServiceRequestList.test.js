// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/vue'
import { describe, it, expect, vi, beforeEach } from 'vitest'
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
      status: 'open',
      serviceName: 'Ride to Clinic',
      memberFullName: 'Alice Anderson',
      volunteerFullName: 'Vera Volunteer',
      serviceDate: '2026-07-20',
      city: 'Springfield',
      villageName: 'Testville',
      createdAt: '2026-07-01T12:00:00Z'
    },
    {
      serviceRequestId: 2,
      displayNumber: 202,
      status: 'open',
      serviceName: 'Grocery Run',
      memberFullName: 'Bob Baker',
      volunteerFullName: 'Wally Volunteer',
      serviceDate: '2026-07-21',
      city: 'Springfield',
      villageName: 'Testville',
      createdAt: '2026-07-02T12:00:00Z'
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
    vi.clearAllMocks()
    // jsdom has no matchMedia; PrimeVue Select uses it on mount
    window.matchMedia = () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {}
    })
  })

  it('downloads only the rows matching the active ID filter', async () => {
    render(MetaServiceRequestList, { global: { plugins: [PrimeVue] } })

    await screen.findAllByText('Alice Anderson')
    expect(screen.getAllByText('Bob Baker').length).toBeGreaterThan(0)

    // expand the collapsed filters panel, then filter by request number
    await fireEvent.click(screen.getByText('Filters'))
    const idInput = screen.getByPlaceholderText('Search by number')
    await fireEvent.update(idInput, '101')

    await waitFor(() => expect(screen.queryAllByText('Bob Baker')).toHaveLength(0))

    await fireEvent.click(screen.getByText('Download'))

    await waitFor(() => expect(downloadCsv).toHaveBeenCalled())
    const [csv, filename] = downloadCsv.mock.calls[0]
    expect(filename).toBe('service-requests.csv')
    expect(csv).toContain('Alice Anderson')
    expect(csv).not.toContain('Bob Baker')
  })
})
