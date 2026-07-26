// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/vue'
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
