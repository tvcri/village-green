// @vitest-environment jsdom
import { render, screen, waitFor, cleanup } from '@testing-library/vue'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import PrimeVue from 'primevue/config'

const routerMock = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }))
const routeMock = vi.hoisted(() => ({ query: {} }))
const userMock = vi.hoisted(() => ({ value: { volunteers: [] } }))

vi.mock('vue-router', () => ({
  useRouter: () => routerMock,
  useRoute: () => routeMock
}))

const mineRow = {
  serviceRequestId: '101',
  requestNumber: null,
  villageId: '1',
  villageName: 'Westside',
  status: 'Confirmed',
  serviceName: 'Ride: Medical Appointment',
  serviceDate: '2026-08-01',
  timesFlexible: false,
  startTime: '09:00:00',
  member: { fullName: 'Pat Member' },
  volunteerPersonId: '7',
  destinations: [
    { destination: 'CVS Pharmacy', city: 'Wakefield' },
    { destination: 'Dr. Smith', city: 'Kingston' }
  ]
}

vi.mock('../api/volunteerRequestApi.js', () => ({
  getVolunteerRequests: vi.fn((scope) => Promise.resolve(scope === 'mine' ? [mineRow] : [])),
  getVolunteerRequestVillages: vi.fn().mockResolvedValue([])
}))

vi.mock('../../../shared/api/userApi.js', () => ({
  getUser: vi.fn(() => Promise.resolve(userMock.value))
}))

import VolunteerHome from '../components/VolunteerHome.vue'

const TWO_VOLUNTEERS = [
  { personId: '7', name: 'Jane Doe', villages: [], capabilities: ['Rides'] },
  { personId: '8', name: 'John Doe', villages: [], capabilities: ['Rides'] },
]

describe('VolunteerHome Volunteer column (multi-volunteer accounts)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Known baseline so a future test that forgets to set userMock fails
    // loudly on an empty account instead of inheriting the previous test's.
    userMock.value = { volunteers: [] }
    routeMock.query = { tab: 'mine' }
    window.matchMedia = () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {}
    })
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  })

  afterEach(() => {
    cleanup()
    routerMock.push.mockReset()
    routerMock.replace.mockReset()
  })

  it('shows the Volunteer column with the owning name when the account has 2+ volunteers', async () => {
    userMock.value = { volunteers: TWO_VOLUNTEERS }
    render(VolunteerHome, { global: { plugins: [PrimeVue] } })
    await waitFor(() => expect(screen.getAllByText('Jane Doe').length).toBeGreaterThan(0))
    expect(screen.getAllByText('Volunteer').length).toBeGreaterThan(0)
  })

  it('hides the Volunteer column for single-volunteer accounts', async () => {
    userMock.value = { volunteers: [TWO_VOLUNTEERS[0]] }
    render(VolunteerHome, { global: { plugins: [PrimeVue] } })
    await waitFor(() => expect(screen.getAllByText('Pat Member').length).toBeGreaterThan(0))
    expect(screen.queryByText('Volunteer')).toBeNull()
    expect(screen.queryByText('Jane Doe')).toBeNull()
  })

  it('VSS: table and card show "CVS Pharmacy +1"', async () => {
    userMock.value = { volunteers: [TWO_VOLUNTEERS[0]] }
    // The Destination column lives on the open-requests tab only.
    routeMock.query = { tab: 'open' }
    const { getVolunteerRequests } = await import('../api/volunteerRequestApi.js')
    getVolunteerRequests.mockImplementation(() => Promise.resolve([mineRow]))
    const { container } = render(VolunteerHome, { global: { plugins: [PrimeVue] } })
    await waitFor(() => expect(screen.getAllByText('Pat Member').length).toBeGreaterThan(0))
    expect(container.querySelector('.p-datatable-tbody').textContent).toContain('CVS Pharmacy +1')
    const cardRows = Array.from(container.querySelectorAll('.request-cards .card-row'))
      .filter(r => r.textContent.includes('Destination'))
    expect(cardRows.map(r => r.textContent)).toContain('DestinationCVS Pharmacy +1')
  })
})
