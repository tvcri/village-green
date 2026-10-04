// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/vue'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import PrimeVue from 'primevue/config'
import VolunteerList from '../components/VolunteerList.vue'
import { downloadCsv } from '../../../shared/lib/csvUtils.js'
import { createSheet } from '../../../shared/services/googleSheetsService.js'

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ params: { villageId: '42' } })
}))

vi.mock('primevue/usetoast', () => ({
  useToast: () => ({ add: vi.fn() })
}))

vi.mock('../api/volunteerApi.js', () => ({
  getVillageVolunteers: vi.fn().mockResolvedValue([
    { volunteerId: 1, personId: 11, fullName: 'Alice Anderson', capabilities: ['Rides'], isAlsoMember: true },
    { volunteerId: 2, personId: 22, fullName: 'Bob Baker', capabilities: ['Meals'], isAlsoMember: false }
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

const mockHasPermission = vi.fn(() => false)
vi.mock('../../../shared/composables/useCurrentUser.js', () => ({
  useCurrentUser: () => ({ hasPermission: mockHasPermission })
}))

vi.mock('../../../shared/services/googleSheetsService.js', () => ({
  createSheet: vi.fn().mockResolvedValue({ url: 'https://sheets.test/x' })
}))

vi.mock('../../../shared/lib/csvUtils.js', async (importOriginal) => ({
  ...(await importOriginal()),
  downloadCsv: vi.fn()
}))

describe('VolunteerList CSV download', () => {
  afterEach(cleanup)

  beforeEach(() => {
    vi.clearAllMocks()
    mockHasPermission.mockImplementation(() => false)
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

  // person:read_birth_date: the API omits birthDate without it, so the export
  // drops the column instead of shipping it empty.
  it('omits the Birth Date column without person:read_birth_date', async () => {
    render(VolunteerList, { global: { plugins: [PrimeVue] } })
    await screen.findAllByText('Alice Anderson')
    await fireEvent.click(screen.getByText('Download'))
    await waitFor(() => expect(downloadCsv).toHaveBeenCalled())
    const [csv] = downloadCsv.mock.calls[0]
    expect(csv.split('\n')[0]).not.toContain('Birth Date')
    expect(mockHasPermission).toHaveBeenCalledWith('person:read_birth_date', '42')
  })

  it('includes the Birth Date column with person:read_birth_date', async () => {
    mockHasPermission.mockImplementation(perm => perm === 'person:read_birth_date')
    render(VolunteerList, { global: { plugins: [PrimeVue] } })
    await screen.findAllByText('Alice Anderson')
    await fireEvent.click(screen.getByText('Download'))
    await waitFor(() => expect(downloadCsv).toHaveBeenCalled())
    const [csv] = downloadCsv.mock.calls[0]
    expect(csv.split('\n')[0]).toContain('Birth Date')
  })

  // isAlsoMember discloses member status, so the API returns it only with
  // member:read; the column follows the same permission.
  describe('Also a Member', () => {
    const csvColumn = (csv, header) => {
      const [head, ...lines] = csv.split('\n')
      const i = head.split(',').indexOf(header)
      return i === -1 ? null : lines.map(l => l.split(',')[i])
    }

    it('shows the column and exports 1/0 with member:read', async () => {
      mockHasPermission.mockImplementation(perm => perm === 'member:read')
      render(VolunteerList, { global: { plugins: [PrimeVue] } })
      await screen.findAllByText('Alice Anderson')
      expect(screen.getByText('Member')).toBeTruthy()
      expect(mockHasPermission).toHaveBeenCalledWith('member:read', '42')

      await fireEvent.click(screen.getByText('Download'))
      await waitFor(() => expect(downloadCsv).toHaveBeenCalled())
      expect(csvColumn(downloadCsv.mock.calls[0][0], 'Also a Member')).toEqual(['1', '0'])
    })

    it('hides the column and the export column without member:read', async () => {
      render(VolunteerList, { global: { plugins: [PrimeVue] } })
      await screen.findAllByText('Alice Anderson')
      expect(screen.queryByText('Member')).toBeNull()

      await fireEvent.click(screen.getByText('Download'))
      await waitFor(() => expect(downloadCsv).toHaveBeenCalled())
      expect(csvColumn(downloadCsv.mock.calls[0][0], 'Also a Member')).toBeNull()
    })

    it('"Both roles" narrows the list, and the export, to dual-role people', async () => {
      mockHasPermission.mockImplementation(perm => perm === 'member:read')
      render(VolunteerList, { global: { plugins: [PrimeVue] } })
      await screen.findAllByText('Bob Baker')

      await fireEvent.click(screen.getByLabelText('Both roles'))
      await waitFor(() => expect(screen.queryAllByText('Bob Baker')).toHaveLength(0))
      expect(screen.getAllByText('Alice Anderson').length).toBeGreaterThan(0)

      await fireEvent.click(screen.getByText('Download'))
      await waitFor(() => expect(downloadCsv).toHaveBeenCalled())
      const [csv] = downloadCsv.mock.calls[0]
      expect(csv).toContain('Alice Anderson')
      expect(csv).not.toContain('Bob Baker')
    })

    it('offers no "Both roles" filter without member:read', async () => {
      render(VolunteerList, { global: { plugins: [PrimeVue] } })
      await screen.findAllByText('Alice Anderson')
      expect(screen.queryByLabelText('Both roles')).toBeNull()
    })

    it('sends the Sheets export a checkmark-formatted flag column', async () => {
      mockHasPermission.mockImplementation(perm => perm === 'member:read')
      const { container } = render(VolunteerList, { global: { plugins: [PrimeVue] } })
      await screen.findAllByText('Alice Anderson')

      await fireEvent.click(container.querySelector('.p-splitbutton-dropdown'))
      await fireEvent.click(await screen.findByText('Create Google Sheet'))
      await waitFor(() => expect(createSheet).toHaveBeenCalled())

      const [rows, columns] = createSheet.mock.calls[0]
      const col = columns.find(c => c.header === 'Also a Member')
      expect(col.numberFormat.pattern).toBe('[=1]"✓";[=0]"";General')
      expect(rows.map(r => r.isAlsoMember)).toEqual([1, 0])
    })
  })
})
