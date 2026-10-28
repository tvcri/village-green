// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/vue'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import PrimeVue from 'primevue/config'
import VolunteerPauseDialog from '../components/VolunteerPauseDialog.vue'

const toastAdd = vi.hoisted(() => vi.fn())
vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: toastAdd }) }))
vi.mock('../api/roleApi.js', () => ({
  putVolunteerPause: vi.fn().mockResolvedValue({}),
  deleteVolunteerPause: vi.fn().mockResolvedValue(undefined)
}))
import { putVolunteerPause, deleteVolunteerPause } from '../api/roleApi.js'

beforeEach(() => {
  window.matchMedia = () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} })
  globalThis.ResizeObserver = class { observe () {} unobserve () {} disconnect () {} }
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-20T15:00:00Z'))
})
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.useRealTimers() })

async function mount (pause = null) {
  const r = render(VolunteerPauseDialog, {
    props: { visible: true, personId: '5', pause },
    global: { plugins: [PrimeVue] }
  })
  await screen.findByRole('dialog')
  return r
}
// Found by id and test id, never by wording: the copy is still being reworked.
const allRadio = () => document.getElementById('pause-scope-all')
const windowRadio = () => document.getElementById('pause-scope-window')
const saveButton = () => screen.getByTestId('pause-save')
const unpauseButton = () => screen.queryByTestId('pause-unpause')

describe('VolunteerPauseDialog', () => {
  it('offers both scopes, all selected by default', async () => {
    await mount(null)
    expect(allRadio()).toBeChecked()
    expect(windowRadio()).toBeInTheDocument()
  })

  it('window scope is disabled until both dates are set', async () => {
    await mount({ startDate: '2026-12-01', endDate: null, scope: 'all' })
    expect(windowRadio()).toBeDisabled()
    cleanup()
    await mount({ startDate: '2026-12-01', endDate: '2026-12-15', scope: 'all' })
    expect(windowRadio()).toBeEnabled()
  })

  it('Save sends civil date strings and scope', async () => {
    const { emitted } = await mount({ startDate: '2026-12-01', endDate: '2026-12-15', scope: 'window' })
    await fireEvent.click(saveButton())
    await waitFor(() => expect(putVolunteerPause).toHaveBeenCalledWith('5',
      { startDate: '2026-12-01', endDate: '2026-12-15', scope: 'window' }))
    await waitFor(() => expect(emitted().saved).toHaveLength(1))
    expect(toastAdd).toHaveBeenCalled()
  })

  it('Unpause shows only when a pause exists and calls delete', async () => {
    await mount(null)
    expect(unpauseButton()).toBeNull()
    cleanup()
    const { emitted } = await mount({ startDate: null, endDate: null, scope: 'all' })
    await fireEvent.click(unpauseButton())
    await waitFor(() => expect(deleteVolunteerPause).toHaveBeenCalledWith('5'))
    await waitFor(() => expect(emitted().saved).toHaveLength(1))
  })

  it('blank dates send null', async () => {
    await mount(null)
    await fireEvent.click(saveButton())
    await waitFor(() => expect(putVolunteerPause).toHaveBeenCalledWith('5',
      { startDate: null, endDate: null, scope: 'all' }))
  })

  it('a past end date shows the warning and Save stays enabled', async () => {
    await mount({ startDate: null, endDate: '2026-11-19', scope: 'all' })
    expect(screen.getByTestId('pause-end-passed')).toBeInTheDocument()
    expect(saveButton()).toBeEnabled()
  })

  it('no warning when the end date is today', async () => {
    await mount({ startDate: null, endDate: '2026-11-20', scope: 'all' })
    expect(screen.queryByTestId('pause-end-passed')).toBeNull()
  })
})
