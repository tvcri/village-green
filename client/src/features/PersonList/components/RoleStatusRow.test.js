// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, cleanup, screen } from '@testing-library/vue'
import PrimeVue from 'primevue/config'
import Tooltip from 'primevue/tooltip'
import RoleStatusRow from './RoleStatusRow.vue'

const HINT = 'No drop reasons yet. An administrator adds them under Admin › Drop Reasons.'

beforeEach(() => {
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addEventListener () {}, removeEventListener () {}, addListener () {}, removeListener () {} }))
  window.ResizeObserver = window.ResizeObserver || class { observe () {} unobserve () {} disconnect () {} }
})
afterEach(() => cleanup())

function mount (props = {}) {
  return render(RoleStatusRow, {
    props: { status: 'Active', dropReasonId: null, reasons: [], ...props },
    global: { plugins: [PrimeVue], directives: { tooltip: Tooltip } },
  })
}

describe('RoleStatusRow', () => {
  it('offers statuses in order Pending, Active, Dropped', async () => {
    const utils = mount()
    const combo = utils.container.querySelector('#status')
    await fireEvent.click(combo)
    const labels = screen.getAllByRole('option').map(o => o.textContent.trim())
    expect(labels).toEqual(['Pending', 'Active', 'Dropped'])
  })

  it('shows Drop Reason only when Dropped', () => {
    expect(mount({ status: 'Active' }).container.querySelector('#dropReasonId')).toBeNull()
    cleanup()
    expect(mount({ status: 'Pending' }).container.querySelector('#dropReasonId')).toBeNull()
    cleanup()
    expect(mount({ status: 'Dropped', reasons: [{ memberDropReasonId: '1', name: 'Moved' }] }).container.querySelector('#dropReasonId')).toBeTruthy()
  })

  it('shows the hint only when Dropped and reasons is empty', () => {
    expect(mount({ status: 'Dropped', reasons: [] }).queryByText(HINT)).toBeTruthy()
    cleanup()
    expect(mount({ status: 'Active', reasons: [] }).queryByText(HINT)).toBeNull()
    cleanup()
    expect(mount({ status: 'Dropped', reasons: [{ memberDropReasonId: '1', name: 'Moved' }] }).queryByText(HINT)).toBeNull()
  })

  it('offers a retired current reason with (retired), using idKey', async () => {
    const utils = mount({
      status: 'Dropped',
      idKey: 'volunteerDropReasonId',
      loadedDropReasonId: '2',
      dropReasonId: '2',
      reasons: [
        { volunteerDropReasonId: '1', name: 'Moved', retired: false },
        { volunteerDropReasonId: '2', name: 'Health', retired: true },
        { volunteerDropReasonId: '3', name: 'Gone', retired: true },
      ],
    })
    const combo = utils.container.querySelector('#dropReasonId')
    await fireEvent.click(combo)
    const labels = screen.getAllByRole('option').map(o => o.textContent.trim())
    expect(labels).toEqual(['Moved', 'Health (retired)'])
  })

  it('emits edited(status) when status changes and shows the drop reason error', async () => {
    const utils = mount({ errors: { dropReasonId: 'A drop reason is required' }, status: 'Dropped', reasons: [{ memberDropReasonId: '1', name: 'Moved' }] })
    expect(utils.queryByText('A drop reason is required')).toBeTruthy()
    const combo = utils.container.querySelector('#status')
    await fireEvent.click(combo)
    await fireEvent.mouseDown(screen.getByRole('option', { name: 'Active' }))
    expect(utils.emitted().edited).toEqual([['status']])
  })

  it('emits edited(dropReasonId) when the drop reason changes', async () => {
    const utils = mount({ status: 'Dropped', reasons: [{ memberDropReasonId: '1', name: 'Moved' }] })
    await fireEvent.click(utils.container.querySelector('#dropReasonId'))
    await fireEvent.mouseDown(screen.getByRole('option', { name: 'Moved' }))
    expect(utils.emitted().edited).toEqual([['dropReasonId']])
  })
})
