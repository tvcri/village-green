// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup } from '@testing-library/vue'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import PrimeVue from 'primevue/config'
import PersonFormFields from '../components/PersonFormFields.vue'

vi.mock('../api/personApi.js', () => ({ geocodeTown: vi.fn() }))

beforeEach(() => {
  window.matchMedia = () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} })
  globalThis.ResizeObserver = class { observe () {} unobserve () {} disconnect () {} }
})
afterEach(() => { cleanup(); vi.clearAllMocks() })

const globalOpts = { plugins: [PrimeVue], directives: { tooltip: {}, Tooltip: {} } }
const baseProps = {
  errors: {}, uncertain: {}, villages: [], circles: [],
  circleNames: new Set(), disabilities: new Map(),
}
const mount = (props = {}) => render(PersonFormFields, { props: { ...baseProps, ...props }, global: globalOpts })

describe('PersonFormFields deceased controls', () => {
  it('date controls hidden until Deceased ticked', async () => {
    mount({ deceased: false })
    expect(screen.queryByLabelText('Date unknown')).toBeNull()
    expect(screen.queryByLabelText('Deceased Date')).toBeNull()
    await fireEvent.click(screen.getByLabelText('Deceased'))
    expect(screen.getByLabelText('Date unknown')).toBeTruthy()
    expect(screen.getByLabelText('Deceased Date')).toBeTruthy()
  })

  it('Date unknown disables and clears the date', async () => {
    const { emitted } = mount({ deceased: true, deceasedDate: '2026-03-04' })
    await fireEvent.click(screen.getByLabelText('Date unknown'))
    expect(emitted()['update:deceasedDate'].at(-1)).toEqual([''])
    expect(screen.getByLabelText('Deceased Date')).toBeDisabled()
  })

  it('unticking Deceased clears the date', async () => {
    const { emitted } = mount({ deceased: true, deceasedDate: '2026-03-04' })
    await fireEvent.click(screen.getByLabelText('Deceased'))
    expect(emitted()['update:deceased'].at(-1)).toEqual([false])
    expect(emitted()['update:deceasedDate'].at(-1)).toEqual([null])
  })

  it('Date unknown is ticked on load when deceased without a date', () => {
    mount({ deceased: true, deceasedDate: null })
    expect(screen.getByLabelText('Date unknown')).toBeChecked()
    expect(screen.getByLabelText('Deceased Date')).toBeDisabled()
  })

  it('warning shows when ticking Deceased with open requests', async () => {
    mount({ deceased: false, openRequestCount: 2, displayName: 'Robert Currie Jr.' })
    expect(screen.queryByText(/open service request/)).toBeNull()
    await fireEvent.click(screen.getByLabelText('Deceased'))
    expect(screen.getByText('Robert Currie Jr. has 2 open service requests. Cancel them separately if they no longer apply.')).toBeTruthy()
  })

  it('warning uses the singular for one request', async () => {
    mount({ deceased: false, openRequestCount: 1, displayName: 'Robert Currie Jr.' })
    await fireEvent.click(screen.getByLabelText('Deceased'))
    expect(screen.getByText(/has 1 open service request\./)).toBeTruthy()
  })

  it('no warning when already deceased on load', () => {
    mount({ deceased: true, deceasedDate: '2026-03-04', openRequestCount: 2, displayName: 'Robert Currie Jr.' })
    expect(screen.queryByText(/open service request/)).toBeNull()
  })

  it('no warning when there are no open requests', async () => {
    mount({ deceased: false, openRequestCount: 0, displayName: 'Robert Currie Jr.' })
    await fireEvent.click(screen.getByLabelText('Deceased'))
    expect(screen.queryByText(/open service request/)).toBeNull()
  })
})
