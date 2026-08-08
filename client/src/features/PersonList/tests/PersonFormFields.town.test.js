// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/vue'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import PrimeVue from 'primevue/config'
import PersonFormFields from '../components/PersonFormFields.vue'

vi.mock('../api/personApi.js', () => ({
  geocodeTown: vi.fn()
}))

beforeEach(() => {
  window.matchMedia = () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {}
  })
  // jsdom has no ResizeObserver; PrimeVue components observe on mount.
  globalThis.ResizeObserver = class {
    observe () {}
    unobserve () {}
    disconnect () {}
  }
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const globalOpts = {
  plugins: [PrimeVue],
  directives: { tooltip: {}, Tooltip: {} }
}

const baseProps = {
  errors: {},
  uncertain: {},
  villages: [],
  communityNames: new Set(),
  disabilities: new Map(),
}

describe('PersonFormFields Municipality display', () => {
  it('fills Municipality from the geocoder on zip blur', async () => {
    const { geocodeTown } = await import('../api/personApi.js')
    geocodeTown.mockResolvedValue({ town: 'South Kingstown' })

    render(PersonFormFields, {
      props: { ...baseProps, street: '123 Main St', city: '', state: 'RI', zip: '02879', town: '' },
      global: globalOpts
    })

    // street+zip are prefilled and town starts empty, so the on-mount lookup
    // also fires here — wait for it to settle before blurring, so the
    // post-blur assertion below counts only the blur-triggered call.
    await screen.findByText('South Kingstown')
    geocodeTown.mockClear()

    await fireEvent.blur(screen.getByLabelText(/zip/i))

    expect(await screen.findByText('South Kingstown')).toBeInTheDocument()
    expect(geocodeTown).toHaveBeenCalledTimes(1)
    expect(geocodeTown).toHaveBeenCalledWith({ street: '123 Main St', city: '', state: 'RI', zip: '02879' })
  })

  it('recalculates over an existing value when the address changes', async () => {
    const { geocodeTown } = await import('../api/personApi.js')
    geocodeTown.mockResolvedValue({ town: 'Richmond' })

    render(PersonFormFields, {
      props: { ...baseProps, street: '456 Elm St', city: '', state: 'RI', zip: '02898', town: 'Hopkinton' },
      global: globalOpts
    })

    expect(screen.getByText('Hopkinton')).toBeInTheDocument()

    await fireEvent.blur(screen.getByLabelText(/zip/i))

    expect(await screen.findByText('Richmond')).toBeInTheDocument()
    expect(screen.queryByText('Hopkinton')).not.toBeInTheDocument()
  })

  it('shows the could-not-determine text and clears the model when the lookup returns null', async () => {
    const { geocodeTown } = await import('../api/personApi.js')
    geocodeTown.mockResolvedValue({ town: null })

    const { emitted } = render(PersonFormFields, {
      props: { ...baseProps, street: '789 Oak St', city: '', state: 'RI', zip: '02891', town: 'Hopkinton' },
      global: globalOpts
    })

    await fireEvent.blur(screen.getByLabelText(/zip/i))

    expect(await screen.findByText(/Couldn't determine automatically/i)).toBeInTheDocument()
    // A null result must clear the model to '' (not null) so the edit-path payload
    // sends an explicit null instead of silently keeping the stale municipality.
    await waitFor(() => expect(emitted()['update:town'].at(-1)).toEqual(['']))
  })

  it('does not call the geocoder when street or zip is empty', async () => {
    const { geocodeTown } = await import('../api/personApi.js')
    geocodeTown.mockResolvedValue({ town: 'South Kingstown' })

    render(PersonFormFields, {
      props: { ...baseProps, street: '123 Main St', city: '', state: 'RI', zip: '', town: '' },
      global: globalOpts
    })

    await fireEvent.blur(screen.getByLabelText(/zip/i))
    await waitFor(() => expect(geocodeTown).not.toHaveBeenCalled())
  })

  it('recalculates on street blur, not only zip blur', async () => {
    const { geocodeTown } = await import('../api/personApi.js')
    geocodeTown.mockResolvedValue({ town: 'Charlestown' })

    render(PersonFormFields, {
      props: { ...baseProps, street: '10 Ross Hill Rd', city: '', state: 'RI', zip: '02813', town: '' },
      global: globalOpts
    })

    // Prefilled street+zip with empty town also triggers the on-mount lookup;
    // let it settle first so the assertions below isolate the blur call.
    await screen.findByText('Charlestown')
    geocodeTown.mockClear()

    await fireEvent.blur(screen.getByLabelText(/^street/i))

    expect(await screen.findByText('Charlestown')).toBeInTheDocument()
    expect(geocodeTown).toHaveBeenCalledTimes(1)
    expect(geocodeTown).toHaveBeenCalledWith({ street: '10 Ross Hill Rd', city: '', state: 'RI', zip: '02813' })
  })

  it('fires the geocoder on mount when street and zip are prefilled and town is empty', async () => {
    const { geocodeTown } = await import('../api/personApi.js')
    geocodeTown.mockResolvedValue({ town: 'Charlestown' })

    render(PersonFormFields, {
      props: { ...baseProps, street: '10 Ross Hill Rd', city: '', state: 'RI', zip: '02813', town: '' },
      global: globalOpts
    })

    expect(await screen.findByText('Charlestown')).toBeInTheDocument()
    expect(geocodeTown).toHaveBeenCalledTimes(1)
    expect(geocodeTown).toHaveBeenCalledWith({ street: '10 Ross Hill Rd', city: '', state: 'RI', zip: '02813' })
  })

  it('does not call the geocoder on mount when town is already populated', async () => {
    const { geocodeTown } = await import('../api/personApi.js')
    geocodeTown.mockResolvedValue({ town: 'Charlestown' })

    render(PersonFormFields, {
      props: { ...baseProps, street: '10 Ross Hill Rd', city: '', state: 'RI', zip: '02813', town: 'Hopkinton' },
      global: globalOpts
    })

    expect(screen.getByText('Hopkinton')).toBeInTheDocument()
    await waitFor(() => expect(geocodeTown).not.toHaveBeenCalled())
  })
})
