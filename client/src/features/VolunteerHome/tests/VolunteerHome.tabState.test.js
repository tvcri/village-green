// @vitest-environment jsdom
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/vue'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import PrimeVue from 'primevue/config'

// Hoisted mock handles so each test can set route.query and inspect replace.
const routerMock = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }))
const routeMock = vi.hoisted(() => ({ query: {} }))

vi.mock('vue-router', () => ({
  useRouter: () => routerMock,
  useRoute: () => routeMock
}))

vi.mock('../api/volunteerRequestApi.js', () => ({
  getVolunteerRequests: vi.fn().mockResolvedValue([]),
  getVolunteerRequestVillages: vi.fn().mockResolvedValue([])
}))

vi.mock('../../../shared/api/userApi.js', () => ({
  getUser: vi.fn().mockResolvedValue({ capabilities: [] })
}))

import VolunteerHome from '../components/VolunteerHome.vue'

describe('VolunteerHome tab state in URL', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    routeMock.query = {}
    window.matchMedia = () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {}
    })
    // jsdom has no ResizeObserver; PrimeVue TabList observes its ink-bar on mount
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  })

  afterEach(() => {
    // Unmount the previous render so its watchers don't react to the next
    // test's shared routeMock; then reset the module-level router mock.
    cleanup()
    routerMock.push.mockReset()
    routerMock.replace.mockReset()
  })

  // The tab list is rendered twice (desktop + mobile), so role queries return
  // multiple matches — assert on the first, which is the desktop copy.
  const firstTab = (name) => screen.getAllByRole('tab', { name })[0]

  it('activates the "My history" tab when route.query.tab is history', async () => {
    routeMock.query = { tab: 'history' }
    render(VolunteerHome, { global: { plugins: [PrimeVue] } })
    // The History tab is only selected when activeTab === 'history'.
    await waitFor(() =>
      expect(firstTab('My history')).toHaveAttribute('aria-selected', 'true')
    )
  })

  it('defaults to "Available requests" when route.query.tab is absent', async () => {
    routeMock.query = {}
    render(VolunteerHome, { global: { plugins: [PrimeVue] } })
    await waitFor(() =>
      expect(firstTab('Available requests')).toHaveAttribute('aria-selected', 'true')
    )
  })

  it('defaults to "Available requests" when route.query.tab is an unknown value', async () => {
    routeMock.query = { tab: 'bogus' }
    render(VolunteerHome, { global: { plugins: [PrimeVue] } })
    await waitFor(() =>
      expect(firstTab('Available requests')).toHaveAttribute('aria-selected', 'true')
    )
  })

  it('calls router.replace with the tab merged into the existing query when the tab changes', async () => {
    routeMock.query = { villageId: '42' }
    render(VolunteerHome, { global: { plugins: [PrimeVue] } })
    await waitFor(() => firstTab('My commitments'))

    await fireEvent.click(firstTab('My commitments'))

    await waitFor(() =>
      expect(routerMock.replace).toHaveBeenCalledWith({ query: { villageId: '42', tab: 'mine' } })
    )
  })
})
