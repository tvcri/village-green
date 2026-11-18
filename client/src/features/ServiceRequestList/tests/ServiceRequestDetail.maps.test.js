// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent, waitFor } from '@testing-library/vue'
import PrimeVue from 'primevue/config'

// Node 24 ships a broken global localStorage; use an in-memory one.
const store = {}
vi.stubGlobal('localStorage', {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v) },
  removeItem: (k) => { delete store[k] }
})
vi.stubGlobal('VG', { Env: { google: { googleMapsKey: 'test-key' } } })

const mockGet = vi.hoisted(() => vi.fn())
vi.mock('../api/serviceRequestApi.js', () => ({ getServiceRequest: mockGet }))
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { id: '7' } }) }))

import ServiceRequestDetail from '../components/ServiceRequestDetail.vue'

const dest = (destination, address, city) => ({ destination, address, city, state: 'RI', zip: null, phone: null })
const base = {
  serviceRequestId: 7, serviceName: 'Ride: Medical', status: 'Open',
  startAddress: '9 Home Rd', startCity: 'Peace Dale', startState: 'RI',
  notificationHistory: []
}

async function mountWith(destinations) {
  mockGet.mockResolvedValue({ ...base, destinations })
  const utils = render(ServiceRequestDetail, { global: { plugins: [PrimeVue] } })
  await waitFor(() => utils.getByText(/Ride: Medical/))
  return utils
}
const frames = (c) => [...c.querySelectorAll('iframe')].map(f => f.getAttribute('src'))
const pins = (c) => new URL(c.querySelector('img.destinations-map').getAttribute('src')).searchParams.getAll('markers')
const links = (c) => [...c.querySelectorAll('.map-links a')].map(a => a.textContent.trim())

describe('ServiceRequestDetail maps', () => {
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
    const { container, getAllByText } = await mountWith([dest('CVS', '1 Main St', 'Wakefield'), dest('Clinic', '2 Oak Ave', 'Kingston')])
    expect(frames(container)).toHaveLength(0)
    expect(pins(container)).toEqual(['color:0x38669f|label:1|1 Main St, Wakefield, RI', 'color:0x38669f|label:2|2 Oak Ave, Kingston, RI'])
    expect(links(container)).toEqual(['1. CVS', '2. Clinic'])
    expect(getAllByText('Destination 1').length).toBeGreaterThan(0)
  })

  it('a stop with no address leaves a gap: pin numbers still match the headings', async () => {
    const { container } = await mountWith([dest('CVS', '1 Main St', 'Wakefield'), dest('Clinic', null, null), dest('Bank', '3 Elm St', 'Kingston')])
    expect(pins(container)).toEqual(['color:0x38669f|label:1|1 Main St, Wakefield, RI', 'color:0x38669f|label:3|3 Elm St, Kingston, RI'])
    expect(links(container)).toEqual(['1. CVS', '3. Bank'])
  })

  it('stops past nine get a plain pin, since a marker label is one character', async () => {
    const stops = Array.from({ length: 10 }, (_, i) => dest(`Stop ${i + 1}`, `${i + 1} Main St`, 'Wakefield'))
    const { container } = await mountWith(stops)
    const all = pins(container)
    expect(all[8]).toContain('label:9|')
    expect(all[9]).toBe('color:0x38669f|10 Main St, Wakefield, RI')
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
    expect(getByText('Always Show Maps')).toBeTruthy()
  })
})

describe('ServiceRequestDetail round trip times', () => {
  afterEach(() => cleanup())

  async function mountTimes(times) {
    mockGet.mockResolvedValue({
      ...base, requestNumber: null, transportationType: 'Round Trip', timesFlexible: false,
      destinations: [dest('CVS', null, null)], ...times
    })
    const utils = render(ServiceRequestDetail, { global: { plugins: [PrimeVue] } })
    await waitFor(() => utils.getByText(/Ride: Medical/))
    return utils
  }

  it('Start and Finish only: one Start / Finish line', async () => {
    const { queryByText, getByText } = await mountTimes({
      startTime: '10:00:00', apptTime: null, returnTime: null, finishTime: '12:00:00'
    })
    expect(getByText('Start / Finish:')).toBeTruthy()
    expect(queryByText('Start / Arrive:')).toBeNull()
  })

  it('with Return set: the two Round Trip lines', async () => {
    const { getByText } = await mountTimes({
      startTime: '10:00:00', apptTime: null, returnTime: '11:30:00', finishTime: '12:00:00'
    })
    expect(getByText('Start / Arrive:')).toBeTruthy()
  })
})
