// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/vue'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import PrimeVue from 'primevue/config'
import VolunteerList from '../components/VolunteerList.vue'
import { downloadCsv } from '../../../shared/lib/csvUtils.js'

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ params: { villageId: '42' } })
}))

vi.mock('primevue/usetoast', () => ({
  useToast: () => ({ add: vi.fn() })
}))

vi.mock('../api/volunteerApi.js', () => ({
  getVillageVolunteers: vi.fn().mockResolvedValue([
    { volunteerId: 1, personId: 11, fullName: 'Alice Anderson', capabilities: ['Rides'] },
    { volunteerId: 2, personId: 22, fullName: 'Bob Baker', capabilities: ['Meals'] }
  ])
}))

vi.mock('../../../shared/api/villageApi.js', () => ({
  getVillagePersons: vi.fn().mockResolvedValue([
    { personId: 11, email: 'alice@example.com', village: { name: 'Testville' } },
    { personId: 22, email: 'bob@example.com', village: { name: 'Testville' } }
  ])
}))

vi.mock('../../../shared/api/analyticsApi.js', () => ({
  postAnalyticsEvents: vi.fn().mockResolvedValue(undefined)
}))

vi.mock('../../../shared/lib/csvUtils.js', async (importOriginal) => ({
  ...(await importOriginal()),
  downloadCsv: vi.fn()
}))

describe('VolunteerList CSV download', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // jsdom has no matchMedia; PrimeVue Select uses it on mount
    window.matchMedia = () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {}
    })
  })

  it('downloads only the rows matching the active search filter', async () => {
    render(VolunteerList, { global: { plugins: [PrimeVue] } })

    // rows appear in both the desktop table and mobile card list
    await screen.findAllByText('Alice Anderson')
    expect(screen.getAllByText('Bob Baker').length).toBeGreaterThan(0)

    const search = screen.getByPlaceholderText('Search by name...')
    await fireEvent.update(search, 'alice')

    // search is debounced 300ms; wait until the table no longer shows Bob
    await waitFor(() => expect(screen.queryAllByText('Bob Baker')).toHaveLength(0))

    await fireEvent.click(screen.getByText('Download'))

    await waitFor(() => expect(downloadCsv).toHaveBeenCalled())
    const [csv, filename] = downloadCsv.mock.calls[0]
    expect(filename).toBe('Testville-volunteers.csv')
    expect(csv).toContain('Alice Anderson')
    expect(csv).not.toContain('Bob Baker')
  })
})
