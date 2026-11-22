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
const pins = (c) => new URL(c.querySelector('img.destinations-map').getAttribute('src')).searchParams.getAll('markers')

describe('VolunteerRequestDetail maps', () => {
  beforeEach(() => { localStorage.removeItem('vg.showMap') })
  afterEach(() => cleanup())

  it('one destination: one route map, no image', async () => {
    const { container } = await mountWith([dest('CVS', '1 Main St', 'Wakefield')])
    const srcs = frames(container)
    expect(srcs).toHaveLength(1)
    expect(srcs[0]).toContain('/directions?')
    expect(container.querySelector('img.destinations-map')).toBeNull()
  })

  it('two destinations: no iframes, one image with a numbered pin each, and a link each', async () => {
    const { container } = await mountWith([dest('CVS', '1 Main St', 'Wakefield'), dest('Clinic', '2 Oak Ave', 'Kingston')])
    expect(frames(container)).toHaveLength(0)
    expect(pins(container)).toEqual(['color:0x38669f|label:1|1 Main St, Wakefield, RI', 'color:0x38669f|label:2|2 Oak Ave, Kingston, RI'])
    expect([...container.querySelectorAll('.map-links a')].map(a => a.textContent.trim())).toEqual(['1. CVS', '2. Clinic'])
  })

  it('two destinations where one has no address: one pin, numbered as its heading', async () => {
    const { container } = await mountWith([dest('Clinic', null, null), dest('CVS', '1 Main St', 'Wakefield')])
    expect(pins(container)).toEqual(['color:0x38669f|label:2|1 Main St, Wakefield, RI'])
  })

  it('two name-only destinations: no map section and no Always Hide Maps button', async () => {
    const { container, queryByText } = await mountWith([dest('CVS', null, null), dest('Clinic', null, null)])
    expect(container.querySelector('.map-section')).toBeNull()
    expect(queryByText('Always Hide Maps')).toBeNull()
  })

  it('showMap false hides the map', async () => {
    const { container, getByText } = await mountWith([dest('CVS', '1 Main St', 'Wakefield'), dest('Clinic', '2 Oak Ave', 'Kingston')])
    await fireEvent.click(getByText('Always Hide Maps'))
    expect(container.querySelector('img.destinations-map')).toBeNull()
  })

  it('shows no destination phone', async () => {
    const { container } = await mountWith([dest('CVS', '1 Main St', 'Wakefield'), dest('Clinic', '2 Oak Ave', 'Kingston')])
    expect(container.querySelector('a[href="tel:401-555-0100"]')).toBeNull()
  })
})

// Arrive and Return are optional on a Round Trip. When both are blank the
// request is "pick up at Start, home by Finish", so show the one Start / Finish
// line rather than two rows of dashes that read as missing data.
describe('VolunteerRequestDetail round trip times', () => {
  afterEach(() => cleanup())

  async function mountTimes(times) {
    mockGet.mockResolvedValue({
      ...base, transportationType: 'Round Trip', timesFlexible: false,
      destinations: [dest('CVS', null, null)], ...times
    })
    const utils = render(VolunteerRequestDetail, { global: { plugins: [PrimeVue, ToastService, ConfirmationService] } })
    await waitFor(() => utils.getByText(/Ride: Medical/))
    return utils
  }

  it('Start and Finish only: one Start / Finish line', async () => {
    const { queryByText, getByText } = await mountTimes({
      startTime: '10:00:00', apptTime: null, returnTime: null, finishTime: '12:00:00'
    })
    expect(getByText('Start / Finish:')).toBeTruthy()
    expect(getByText('10:00 AM / 12:00 PM')).toBeTruthy()
    expect(queryByText('Start / Arrive:')).toBeNull()
  })

  it('with Arrive set: the two Round Trip lines', async () => {
    const { getByText } = await mountTimes({
      startTime: '10:00:00', apptTime: '10:30:00', returnTime: null, finishTime: '12:00:00'
    })
    expect(getByText('Start / Arrive:')).toBeTruthy()
    expect(getByText('Return / Finish:')).toBeTruthy()
  })
})

// Service notes show on every request a volunteer can see, Open included: the
// request emails already send them as "Members Special Instructions".
describe('VolunteerRequestDetail service notes', () => {
  afterEach(() => cleanup())

  async function mountNotes(memberServiceNotes) {
    mockGet.mockResolvedValue({ ...base, destinations: [dest('CVS', null, null)], memberServiceNotes })
    const utils = render(VolunteerRequestDetail, { global: { plugins: [PrimeVue, ToastService, ConfirmationService] } })
    await waitFor(() => utils.getByText(/Ride: Medical/))
    return utils
  }

  it('shows the member\'s notes under a Service Notes heading', async () => {
    const { getByText } = await mountNotes('Uses a walker; ring the side door.')
    expect(getByText('Service Notes')).toBeTruthy()
    expect(getByText('Uses a walker; ring the side door.')).toBeTruthy()
  })

  it('says so when the member has none', async () => {
    const { getByText } = await mountNotes(null)
    expect(getByText('Service Notes')).toBeTruthy()
    expect(getByText('There are no service notes for this member')).toBeTruthy()
  })
})
