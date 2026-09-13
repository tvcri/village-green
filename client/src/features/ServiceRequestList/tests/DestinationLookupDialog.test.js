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

// The bias droplist is a PrimeVue Select whose overlay teleports and which
// jsdom renders unreliably, so these tests drive its model directly. Same
// recipe as ServiceRequestCreateEdit.test.js: a mixin catches the SFC's setup
// state on created(), because `<script setup>` bindings are closed to
// getComponent().vm.
function renderExposed (props) {
  let setupState = null
  const utils = render(DestinationLookupDialog, {
    props,
    global: {
      ...globalOpts,
      mixins: [{
        created () {
          if (this.$options.name === 'DestinationLookupDialog') setupState = this.$.setupState
        }
      }]
    }
  })
  return { ...utils, setup: () => setupState }
}

async function openAndSearch (text, props = {}, opts = {}) {
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
  if (opts.near) await fireEvent.click(await screen.findByLabelText(/near Barrington, RI/i))
  await fireEvent.click(await screen.findByRole('button', { name: 'Find matches' }))
  return { ...utils, searchPlaces }
}

describe('DestinationLookupDialog', () => {
  // The town narrows "CVS" to the member's CVS, but it is wrong whenever the
  // appointment is out of area — so the coordinator opts in, per lookup.
  it('searches exactly what was entered by default', async () => {
    const { searchPlaces } = await openAndSearch('Serra Physical Therapy')
    await waitFor(() => expect(searchPlaces).toHaveBeenCalledTimes(1))
    expect(searchPlaces).toHaveBeenCalledWith({ text: 'Serra Physical Therapy', bias: 'member' })
  })

  it('adds the member town and state when the coordinator turns it on', async () => {
    const { searchPlaces } = await openAndSearch('Serra Physical Therapy', {}, { near: true })
    await waitFor(() => expect(searchPlaces).toHaveBeenCalledTimes(1))
    // State matters: a bare "Hopkinton" resolves to Massachusetts.
    expect(searchPlaces).toHaveBeenCalledWith({ text: 'Serra Physical Therapy', town: 'Barrington', state: 'RI', bias: 'member' })
  })

  it('starts off again the next time the dialog opens', async () => {
    const { rerender, searchPlaces } = await openAndSearch('Serra', {}, { near: true })
    await waitFor(() => expect(searchPlaces).toHaveBeenCalledTimes(1))
    await rerender({ visible: false, town: 'Barrington', state: 'RI' })
    await rerender({ visible: true, town: 'Barrington', state: 'RI' })
    expect(await screen.findByLabelText(/near Barrington, RI/i)).not.toBeChecked()
  })

  // DEMO-ONLY control; remove with the maxResults request field.
  it('sends the demo result count when it has been changed', async () => {
    const { searchPlaces } = await import('../api/serviceRequestApi.js')
    searchPlaces.mockResolvedValue({ places: [SERRA] })
    render(DestinationLookupDialog, { props: { visible: true, town: '', state: '' }, global: globalOpts })
    await fireEvent.update(await screen.findByLabelText('Destination'), 'Ortho RI')
    await fireEvent.update(await screen.findByLabelText('Max results'), '15')
    await fireEvent.click(await screen.findByRole('button', { name: 'Find matches' }))
    await waitFor(() => expect(searchPlaces).toHaveBeenCalledWith({ text: 'Ortho RI', bias: 'member', maxResults: 15 }))
  })

  it('defaults the demo result count to 20, Google\'s ceiling', async () => {
    render(DestinationLookupDialog, { props: { visible: true, town: '', state: '' }, global: globalOpts })
    expect(await screen.findByLabelText('Max results')).toHaveValue(20)
  })


  it('offers no toggle when the member has no town on file', async () => {
    render(DestinationLookupDialog, { props: { visible: true, town: '', state: '' }, global: globalOpts })
    await screen.findByLabelText('Destination')
    expect(screen.queryByRole('checkbox')).toBeNull()
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

  it('names the member town and state on the toggle, and starts unchecked', async () => {
    render(DestinationLookupDialog, { props: { visible: true, town: 'Barrington', state: 'RI' }, global: globalOpts })
    // "near", never "in" — the search is biased toward the town, not fenced to it.
    const toggle = await screen.findByLabelText('Search near Barrington, RI')
    expect(toggle).not.toBeChecked()
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

  // --- location bias ----------------------------------------------------
  //
  // The bias circle is not cosmetic. On Azure App Service the Google caller IP
  // is in northern Virginia and Google's no-bias fallback is IP-based, so the
  // circle is the only thing keeping production results in Rhode Island. A
  // fixed statewide centre also measurably steered results toward the towns
  // near it — Joanne noticed "a seeming emphasis on Barrington addresses"
  // before knowing the circle existed.
  it('centres the search on the member when coordinates are available', async () => {
    const { searchPlaces } = await openAndSearch('Serra', { memberCoords: MEMBER_COORDS })
    await waitFor(() => expect(searchPlaces).toHaveBeenCalledWith({
      text: 'Serra', bias: 'member', latitude: 41.429478, longitude: -71.518224
    }))
  })

  // Coordinates are simply omitted, never sent as null: the API reads their
  // absence as "fall back to the statewide circle", which is the right
  // behaviour for a member whose address does not geocode.
  it('omits the coordinates entirely when the member has none', async () => {
    const { searchPlaces } = await openAndSearch('Serra', { memberCoords: null })
    await waitFor(() => expect(searchPlaces).toHaveBeenCalledWith({ text: 'Serra', bias: 'member' }))
  })

  it('omits unusable coordinates rather than sending them', async () => {
    const { searchPlaces } = await openAndSearch('Serra', { memberCoords: { latitude: null, longitude: null } })
    await waitFor(() => expect(searchPlaces).toHaveBeenCalledWith({ text: 'Serra', bias: 'member' }))
  })

  // "Near the member" with no coordinates silently behaves as Statewide. The
  // coordinator has no other way to see that — a stale or unmappable member
  // address looks identical to a working one from inside this dialog.
  it('says so when member-centred is not actually possible', async () => {
    render(DestinationLookupDialog, {
      props: { visible: true, town: 'Barrington', state: 'RI', memberCoords: null },
      global: globalOpts
    })
    expect(await screen.findByText(/not located — using statewide/i)).toBeInTheDocument()
  })

  it('shows no such warning once the coordinates arrive', async () => {
    render(DestinationLookupDialog, {
      props: { visible: true, town: 'Barrington', state: 'RI', memberCoords: MEMBER_COORDS },
      global: globalOpts
    })
    await screen.findByLabelText('Destination')
    expect(screen.queryByText(/not located/i)).toBeNull()
  })

  it('sends the chosen bias, and drops the coordinates when it is not member', async () => {
    const { searchPlaces } = await import('../api/serviceRequestApi.js')
    searchPlaces.mockResolvedValue({ places: [SERRA] })
    const { setup } = renderExposed({ visible: true, town: '', state: '', memberCoords: MEMBER_COORDS })
    await fireEvent.update(await screen.findByLabelText('Destination'), 'Serra')
    setup().bias = 'statewide'
    await fireEvent.click(await screen.findByRole('button', { name: 'Find matches' }))
    await waitFor(() => expect(searchPlaces).toHaveBeenCalledWith({ text: 'Serra', bias: 'statewide' }))
  })

  it('can send no bias at all — the dev-only option', async () => {
    const { searchPlaces } = await import('../api/serviceRequestApi.js')
    searchPlaces.mockResolvedValue({ places: [SERRA] })
    const { setup } = renderExposed({ visible: true, town: '', state: '', memberCoords: MEMBER_COORDS })
    await fireEvent.update(await screen.findByLabelText('Destination'), 'Serra')
    setup().bias = 'none'
    await fireEvent.click(await screen.findByRole('button', { name: 'Find matches' }))
    await waitFor(() => expect(searchPlaces).toHaveBeenCalledWith({ text: 'Serra', bias: 'none' }))
  })

  // Resets with everything else: a coordinator who reached for "No bias" to
  // debug one search must not leave it armed for the next member.
  it('returns to member-centred the next time the dialog opens', async () => {
    const { searchPlaces } = await import('../api/serviceRequestApi.js')
    searchPlaces.mockResolvedValue({ places: [SERRA] })
    const { rerender, setup } = renderExposed({ visible: true, town: '', state: '', memberCoords: MEMBER_COORDS })
    await screen.findByLabelText('Destination')
    setup().bias = 'none'
    await rerender({ visible: false, town: '', state: '', memberCoords: MEMBER_COORDS })
    await rerender({ visible: true, town: '', state: '', memberCoords: MEMBER_COORDS })
    await fireEvent.update(await screen.findByLabelText('Destination'), 'Serra')
    await fireEvent.click(await screen.findByRole('button', { name: 'Find matches' }))
    await waitFor(() => expect(searchPlaces).toHaveBeenCalledWith({
      text: 'Serra', bias: 'member', latitude: 41.429478, longitude: -71.518224
    }))
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
