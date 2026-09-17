// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/vue'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import PrimeVue from 'primevue/config'
import DestinationLookupDialog from '../components/DestinationLookupDialog.vue'

vi.mock('../api/serviceRequestApi.js', () => ({
  searchPlaces: vi.fn()
}))

// 283 Post Road, South Kingstown — the geocode verified live 2026-09-11.
const MEMBER_COORDS = { latitude: 41.429478, longitude: -71.518224 }

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
    props: { visible: true, memberCoords: MEMBER_COORDS, memberCoordsStatus: 'ok', ...props },
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
  // The working group asked for every option to go and the defaults to become
  // the only behaviour: no town/state checkbox, no bias droplist, no result
  // count. The dialog is now a search box and a list.
  it('offers no options — just the search box', async () => {
    render(DestinationLookupDialog, {
      props: { visible: true, memberCoords: MEMBER_COORDS, memberCoordsStatus: 'ok' },
      global: globalOpts
    })
    await screen.findByLabelText('Destination')
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.queryByLabelText(/max results/i)).toBeNull()
    expect(screen.queryByText(/rank results/i)).toBeNull()
  })

  // Centred on the member's home. This is the whole point of the geocode the
  // form fires on member-select.
  it('centres the search on the member when coordinates are available', async () => {
    const { searchPlaces } = await openAndSearch('Serra')
    await waitFor(() => expect(searchPlaces).toHaveBeenCalledWith({
      text: 'Serra', bias: 'member', latitude: 41.429478, longitude: -71.518224
    }))
  })

  // The retained fallback: an address that will not geocode gets the statewide
  // circle. Asked for explicitly rather than left to the API's default, so the
  // request says what it means.
  it('falls back to statewide when the address cannot be located', async () => {
    const { searchPlaces } = await openAndSearch('Serra', {
      memberCoords: null, memberCoordsStatus: 'failed'
    })
    await waitFor(() => expect(searchPlaces).toHaveBeenCalledWith({ text: 'Serra', bias: 'statewide' }))
  })

  it('falls back to statewide when the coordinates are unusable', async () => {
    const { searchPlaces } = await openAndSearch('Serra', {
      memberCoords: { latitude: null, longitude: null }, memberCoordsStatus: 'ok'
    })
    await waitFor(() => expect(searchPlaces).toHaveBeenCalledWith({ text: 'Serra', bias: 'statewide' }))
  })

  // 'pending' is optimistic by design — the geocode is fired on member-select,
  // so it has almost always landed before this dialog opens. With coordinates
  // already in hand it must centre on them, not wait.
  it('uses coordinates that arrived while the status was still pending', async () => {
    const { searchPlaces } = await openAndSearch('Serra', {
      memberCoords: MEMBER_COORDS, memberCoordsStatus: 'pending'
    })
    await waitFor(() => expect(searchPlaces).toHaveBeenCalledWith({
      text: 'Serra', bias: 'member', latitude: 41.429478, longitude: -71.518224
    }))
  })

  // The member's town and state are no longer appended to the query text. The
  // checkbox that did it is gone and its default was off, so a bare search is
  // exactly what the coordinator typed.
  it('sends only what was typed, with no town or state appended', async () => {
    const { searchPlaces } = await openAndSearch('Serra Physical Therapy')
    await waitFor(() => expect(searchPlaces).toHaveBeenCalledTimes(1))
    const body = searchPlaces.mock.calls[0][0]
    expect(body.text).toBe('Serra Physical Therapy')
    expect(body).not.toHaveProperty('town')
    expect(body).not.toHaveProperty('state')
  })

  // The API's own default is the same 20 the removed control defaulted to, so
  // the field is omitted rather than restated.
  it('never sends a result count', async () => {
    const { searchPlaces } = await openAndSearch('Serra')
    await waitFor(() => expect(searchPlaces).toHaveBeenCalledTimes(1))
    expect(searchPlaces.mock.calls[0][0]).not.toHaveProperty('maxResults')
  })

  // The field the lookup fills is usually already populated — Starting
  // Location auto-fills with "Member's Home", and edit mode carries a saved
  // destination. Pre-filling would seed the search with text nobody wants to
  // search for, and invite an accidental overwrite of a good address.
  it('opens with an empty search box, and re-opens empty after a search', async () => {
    const { rerender } = await openAndSearch('Serra Physical Therapy')
    await waitFor(() => screen.getByText('Serra Physical Therapy'))
    await rerender({ visible: false, memberCoords: MEMBER_COORDS, memberCoordsStatus: 'ok' })
    await rerender({ visible: true, memberCoords: MEMBER_COORDS, memberCoordsStatus: 'ok' })
    expect(await screen.findByLabelText('Destination')).toHaveValue('')
  })

  it('clears a previous search\'s results when re-opened', async () => {
    const { rerender } = await openAndSearch('Serra')
    await waitFor(() => screen.getByText('Serra Physical Therapy'))
    await rerender({ visible: false, memberCoords: MEMBER_COORDS, memberCoordsStatus: 'ok' })
    await rerender({ visible: true, memberCoords: MEMBER_COORDS, memberCoordsStatus: 'ok' })
    await screen.findByLabelText('Destination')
    expect(screen.queryByText('Serra Physical Therapy')).toBeNull()
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
    render(DestinationLookupDialog, { props: { visible: true }, global: globalOpts })
    await fireEvent.update(await screen.findByLabelText('Destination'), 'zzz')
    await fireEvent.click(await screen.findByRole('button', { name: 'Find matches' }))
    await waitFor(() => expect(screen.getByText(/no matches/i)).toBeInTheDocument())
  })

  // The service never throws — it resolves to [] — but the client call can
  // still fail in transport, and an error modal over the dialog would be worse
  // than an empty list.
  it('shows no matches rather than propagating a failed call', async () => {
    const { searchPlaces } = await import('../api/serviceRequestApi.js')
    searchPlaces.mockRejectedValue(new Error('network'))
    render(DestinationLookupDialog, { props: { visible: true }, global: globalOpts })
    await fireEvent.update(await screen.findByLabelText('Destination'), 'zzz')
    await fireEvent.click(await screen.findByRole('button', { name: 'Find matches' }))
    await waitFor(() => expect(screen.getByText(/no matches/i)).toBeInTheDocument())
  })

  it('labels itself for the leg it is filling', async () => {
    render(DestinationLookupDialog, {
      props: { visible: true, legLabel: 'Starting location' },
      global: globalOpts
    })
    expect(await screen.findByLabelText('Starting location')).toBeInTheDocument()
  })
})
