// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/vue'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import PrimeVue from 'primevue/config'
import MemberList from '../components/MemberList.vue'
import { downloadCsv } from '../../../shared/lib/csvUtils.js'

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ params: { villageId: '42' } })
}))

vi.mock('primevue/usetoast', () => ({
  useToast: () => ({ add: vi.fn() })
}))

vi.mock('../api/memberApi.js', () => ({
  getVillageMembers: vi.fn().mockResolvedValue([
    { memberId: 1, personId: 11, fullName: 'Alice Anderson', memberNumber: 'M1', memberLevel: 'Primary', joinDate: '2024-01-01' },
    { memberId: 2, personId: 22, fullName: 'Bob Baker', memberNumber: 'M2', memberLevel: 'Secondary', joinDate: '2024-02-02' }
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

describe('MemberList CSV download', () => {
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
    render(MemberList, { global: { plugins: [PrimeVue] } })

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
    expect(filename).toBe('Testville-members.csv')
    expect(csv).toContain('Alice Anderson')
    expect(csv).not.toContain('Bob Baker')
  })
})
