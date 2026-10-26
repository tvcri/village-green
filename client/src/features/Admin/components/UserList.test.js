// @vitest-environment jsdom
import { render, screen, waitFor, fireEvent, within } from '@testing-library/vue'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import PrimeVue from 'primevue/config'
import UserList from './UserList.vue'

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: vi.fn() }) }))
vi.mock('../../../shared/api/userApi.js', () => ({
  getUsersWithGrants: vi.fn().mockResolvedValue([
    { userId: '1', username: 'vol@example.com', displayName: 'Vol', status: 'available', grants: [], isVolunteer: true,
      privacyStatus: { needsAck: false, pendingRulesId: 1, lastAckedRulesId: 1, lastAcknowledgedAt: '2026-05-01T12:00:00Z' } },
    { userId: '2', username: 'plain@example.com', displayName: 'Plain', status: 'available', grants: [], isVolunteer: false,
      privacyStatus: { needsAck: true, pendingRulesId: 1, lastAckedRulesId: null, lastAcknowledgedAt: null } }
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
    expect(csv.split('\n')[0]).toBe('Username,Display Name,Access,VSS,Status,Privacy,Privacy Acknowledged,Last Access')
    expect(csv).toContain('vol@example.com')
    expect(csv).toContain('plain@example.com')
    expect(csv).toContain('vol@example.com,Vol,,Yes,available,Acknowledged,')
    expect(csv).toContain('plain@example.com,Plain,,No,available,Never,,')
  })
})

describe('UserList privacy column', () => {
  beforeEach(() => {
    window.matchMedia = () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} })
  })
  afterEach(() => { vi.clearAllMocks() })

  it('tags each row with its privacy-ack status', async () => {
    // Scoped to this render: earlier describes' renders stay mounted in this file.
    const { container } = render(UserList, { global: { plugins: [PrimeVue] } })
    const view = within(container)
    await waitFor(() => expect(view.getAllByText('Vol').length).toBeGreaterThan(0))
    expect(view.getAllByText('Privacy').length).toBeGreaterThan(0)
    expect(view.getAllByText('Acknowledged')).toHaveLength(1)
    expect(view.getAllByText('Never')).toHaveLength(1)
  })
})
