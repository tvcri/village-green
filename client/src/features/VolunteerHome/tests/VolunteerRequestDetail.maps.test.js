// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent, waitFor } from '@testing-library/vue'
import PrimeVue from 'primevue/config'
import ToastService from 'primevue/toastservice'
import ConfirmationService from 'primevue/confirmationservice'

// Node 24 ships a broken global localStorage; use an in-memory one.
const store = {}
vi.stubGlobal('localStorage', {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v) },
  removeItem: (k) => { delete store[k] }
})
vi.stubGlobal('VG', { Env: { google: { googleMapsKey: 'test-key' } } })

const mockGet = vi.hoisted(() => vi.fn())
vi.mock('../api/volunteerRequestApi.js', () => ({
  getVolunteerRequest: mockGet, signUpVolunteerRequest: vi.fn(), releaseVolunteerRequest: vi.fn()
}))
vi.mock('../../../shared/api/userApi.js', () => ({ getUser: vi.fn().mockResolvedValue({ volunteers: [] }) }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: '7' }, query: {} }),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() })
}))

import VolunteerRequestDetail from '../components/VolunteerRequestDetail.vue'

const dest = (destination, address, city) => ({ destination, address, city, state: 'RI', zip: null, phone: '401-555-0100' })
const base = {
  serviceRequestId: 7, serviceName: 'Ride: Medical', status: 'Open',
  member: { fullName: 'Member, Test', address: '9 Home Rd', city: 'Peace Dale', state: 'RI', zip: '02879' }
}

async function mountWith(destinations) {
  mockGet.mockResolvedValue({ ...base, destinations })
  const utils = render(VolunteerRequestDetail, { global: { plugins: [PrimeVue, ToastService, ConfirmationService] } })
  await waitFor(() => utils.getByText(/Ride: Medical/))
  return utils
}
const frames = (c) => [...c.querySelectorAll('iframe')].map(f => f.getAttribute('src'))

describe('VolunteerRequestDetail maps', () => {
  beforeEach(() => { localStorage.removeItem('vg.showMap') })
  afterEach(() => cleanup())

  it('one destination: one route map, no place map', async () => {
    const { container } = await mountWith([dest('CVS', '1 Main St', 'Wakefield')])
    const srcs = frames(container)
    expect(srcs).toHaveLength(1)
    expect(srcs[0]).toContain('/directions?')
  })

  it('two destinations: no route map, one place map per destination, each labelled with its name', async () => {
    const { container } = await mountWith([dest('CVS', '1 Main St', 'Wakefield'), dest('Clinic', '2 Oak Ave', 'Kingston')])
    const srcs = frames(container)
    expect(srcs).toHaveLength(2)
    expect(srcs.every(s => s.includes('/place?'))).toBe(true)
    expect([...container.querySelectorAll('.map-route-label')].map(p => p.textContent)).toEqual(['CVS', 'Clinic'])
  })

  it('two destinations where one has no address: one place map', async () => {
    const { container } = await mountWith([dest('CVS', '1 Main St', 'Wakefield'), dest('Clinic', null, null)])
    expect(frames(container)).toHaveLength(1)
  })

  it('two name-only destinations: no map section and no Always Hide Maps button', async () => {
    const { container, queryByText } = await mountWith([dest('CVS', null, null), dest('Clinic', null, null)])
    expect(container.querySelector('.map-section')).toBeNull()
    expect(queryByText('Always Hide Maps')).toBeNull()
  })

  it('showMap false hides the place maps', async () => {
    const { container, getByText } = await mountWith([dest('CVS', '1 Main St', 'Wakefield'), dest('Clinic', '2 Oak Ave', 'Kingston')])
    await fireEvent.click(getByText('Always Hide Maps'))
    expect(frames(container)).toHaveLength(0)
  })

  it('shows no destination phone', async () => {
    const { container } = await mountWith([dest('CVS', '1 Main St', 'Wakefield'), dest('Clinic', '2 Oak Ave', 'Kingston')])
    expect(container.querySelector('a[href="tel:401-555-0100"]')).toBeNull()
  })
})
