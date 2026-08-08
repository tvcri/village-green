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

    await fireEvent.blur(screen.getByLabelText(/zip/i))

    expect(await screen.findByText('South Kingstown')).toBeInTheDocument()
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

  it('shows the could-not-determine text when the lookup returns null', async () => {
    const { geocodeTown } = await import('../api/personApi.js')
    geocodeTown.mockResolvedValue({ town: null })

    render(PersonFormFields, {
      props: { ...baseProps, street: '789 Oak St', city: '', state: 'RI', zip: '02891', town: '' },
      global: globalOpts
    })

    await fireEvent.blur(screen.getByLabelText(/zip/i))

    expect(await screen.findByText(/Couldn't determine automatically/i)).toBeInTheDocument()
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
})
