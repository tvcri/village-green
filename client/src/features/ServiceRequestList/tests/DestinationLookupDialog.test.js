// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/vue'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import PrimeVue from 'primevue/config'
import DestinationLookupDialog from '../components/DestinationLookupDialog.vue'

vi.mock('../api/serviceRequestApi.js', () => ({
  searchPlaces: vi.fn()
}))

const SERRA = {
  placeId: 'ChIJuxtkRqxR5IkRgn0NsxVSiws',
  name: 'Serra Physical Therapy',
  formattedAddress: '60 Bay Spring Ave A2, Barrington, RI 02806, USA',
  address: '60 Bay Spring Avenue, Suite A2',
  city: 'Barrington',
  state: 'RI',
  zip: '02806'
}

beforeEach(() => {
  window.matchMedia = () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} })
  globalThis.ResizeObserver = class { observe () {} unobserve () {} disconnect () {} }
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const globalOpts = { plugins: [PrimeVue] }

async function openAndSearch (text, props = {}) {
  const { searchPlaces } = await import('../api/serviceRequestApi.js')
  searchPlaces.mockResolvedValue({ places: [SERRA] })
  const utils = render(DestinationLookupDialog, {
    props: { visible: true, town: 'Barrington', state: 'RI', ...props },
    global: globalOpts
  })
  // PrimeVue's Portal teleports the dialog body only after mount, so the
  // content is a tick behind render(); findBy* waits for it.
  const input = await screen.findByLabelText('Destination')
  await fireEvent.update(input, text)
  await fireEvent.click(await screen.findByRole('button', { name: 'Find matches' }))
  return { ...utils, searchPlaces }
}

describe('DestinationLookupDialog', () => {
  it('searches with the typed text and the member town and state', async () => {
    const { searchPlaces } = await openAndSearch('Serra Physical Therapy')
    await waitFor(() => expect(searchPlaces).toHaveBeenCalledTimes(1))
    // State matters: a bare "Hopkinton" resolves to Massachusetts.
    expect(searchPlaces).toHaveBeenCalledWith({ text: 'Serra Physical Therapy', town: 'Barrington', state: 'RI' })
  })

  // The field the lookup fills is usually already populated — Starting
  // Location auto-fills with "Member's Home", and edit mode carries a saved
  // destination. Pre-filling would seed the search with text nobody wants to
  // search for, and invite an accidental overwrite of a good address.
  it('opens with an empty search box, and re-opens empty after a search', async () => {
    const { rerender } = await openAndSearch('Serra Physical Therapy')
    await waitFor(() => screen.getByText('Serra Physical Therapy'))
    await rerender({ visible: false, town: 'Barrington', state: 'RI' })
    await rerender({ visible: true, town: 'Barrington', state: 'RI' })
    expect(await screen.findByLabelText('Destination')).toHaveValue('')
  })

  it('tells the coordinator it is searching near the member town and state', async () => {
    render(DestinationLookupDialog, { props: { visible: true, town: 'Barrington', state: 'RI' }, global: globalOpts })
    // "near", never "in" — the search is biased toward the town, not fenced to it.
    expect(await screen.findByText('Searching near Barrington, RI')).toBeInTheDocument()
  })

  it('lists each match by name and address, with a count and timing', async () => {
    await openAndSearch('Serra')
    await waitFor(() => expect(screen.getByText('Serra Physical Therapy')).toBeInTheDocument())
    expect(screen.getByText('60 Bay Spring Ave A2, Barrington, RI 02806, USA')).toBeInTheDocument()
    expect(screen.getByText(/1 match · \d+ ms/)).toBeInTheDocument()
  })

  it('emits the chosen place and closes', async () => {
    const { emitted } = await openAndSearch('Serra')
    await waitFor(() => screen.getByText('Serra Physical Therapy'))
    await fireEvent.click(screen.getByText('Serra Physical Therapy'))
    expect(emitted().select[0]).toEqual([SERRA])
    expect(emitted()['update:visible'][0]).toEqual([false])
  })

  it('shows a no-matches message when nothing comes back', async () => {
    const { searchPlaces } = await import('../api/serviceRequestApi.js')
    searchPlaces.mockResolvedValue({ places: [] })
    render(DestinationLookupDialog, { props: { visible: true, town: '' }, global: globalOpts })
    await fireEvent.update(await screen.findByLabelText('Destination'), 'zzz')
    await fireEvent.click(await screen.findByRole('button', { name: 'Find matches' }))
    await waitFor(() => expect(screen.getByText(/no matches/i)).toBeInTheDocument())
  })
})
