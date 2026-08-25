// @vitest-environment jsdom
import { render, screen, waitFor, fireEvent } from '@testing-library/vue'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import PrimeVue from 'primevue/config'
import UserList from './UserList.vue'

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: vi.fn() }) }))
vi.mock('../../../shared/api/userApi.js', () => ({
  getUsersWithGrants: vi.fn().mockResolvedValue([
    { userId: '1', username: 'vol@example.com', displayName: 'Vol', status: 'available', grants: [], isVolunteer: true },
    { userId: '2', username: 'plain@example.com', displayName: 'Plain', status: 'available', grants: [], isVolunteer: false }
  ]),
  deleteUser: vi.fn()
}))
vi.mock('../api/villageGrantApi.js', () => ({ getVillages: vi.fn().mockResolvedValue([]) }))
vi.mock('../../../shared/lib/csvUtils.js', async (importOriginal) => ({
  ...(await importOriginal()),
  downloadCsv: vi.fn()
}))
vi.mock('../../../shared/services/googleSheetsService.js', () => ({ createSheet: vi.fn() }))

import { downloadCsv } from '../../../shared/lib/csvUtils.js'

describe('UserList VSS tag', () => {
  beforeEach(() => {
    // jsdom has no matchMedia; PrimeVue Select uses it on mount
    window.matchMedia = () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} })
  })
  afterEach(() => { vi.clearAllMocks() })

  it('renders a VSS tag only for volunteer-eligible rows', async () => {
    render(UserList, { global: { plugins: [PrimeVue] } })
    await waitFor(() => expect(screen.getAllByText('Vol').length).toBeGreaterThan(0))
    // Exactly one of the two seeded rows is isVolunteer:true.
    expect(screen.getAllByText('VSS')).toHaveLength(1)
  })
})


describe('UserList export', () => {
  beforeEach(() => {
    window.matchMedia = () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} })
  })
  afterEach(() => { vi.clearAllMocks() })

  it('renders a Download button in the paginator', async () => {
    render(UserList, { global: { plugins: [PrimeVue] } })
    await waitFor(() => expect(screen.getAllByText('Vol').length).toBeGreaterThan(0))
    // PrimeVue renders the paginator template more than once; one button per instance.
    expect(screen.getAllByText('Download').length).toBeGreaterThan(0)
  })

  it('downloads a CSV of the visible rows when clicked', async () => {
    render(UserList, { global: { plugins: [PrimeVue] } })
    await waitFor(() => expect(screen.getAllByText('Vol').length).toBeGreaterThan(0))

    await fireEvent.click(screen.getAllByText('Download')[0])

    await waitFor(() => expect(downloadCsv).toHaveBeenCalledTimes(1))
    const [csv, filename] = downloadCsv.mock.calls[0]
    expect(filename).toBe('users.csv')
    expect(csv.split('\n')[0]).toBe('Username,Display Name,Access,VSS,Status,Last Access')
    expect(csv).toContain('vol@example.com')
    expect(csv).toContain('plain@example.com')
    expect(csv).toContain('vol@example.com,Vol,,Yes,available,')
  })
})
