// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/vue'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import PrimeVue from 'primevue/config'
import CatalogAdmin from '../components/CatalogAdmin.vue'

const confirmRequire = vi.fn()
vi.mock('primevue/useconfirm', () => ({ useConfirm: () => ({ require: confirmRequire }) }))
vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: vi.fn() }) }))
vi.mock('vue-router', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }))
vi.mock('../../../shared/composables/useRequirePermission.js', () => ({ useRequirePermission: () => {} }))
vi.mock('../../Trainings/api/trainingApi.js', () => ({
  getTrainings: vi.fn(), createTraining: vi.fn(), patchTraining: vi.fn(), deleteTraining: vi.fn(),
}))
vi.mock('../../Positions/api/positionApi.js', () => ({
  getPositions: vi.fn(), createPosition: vi.fn(), patchPosition: vi.fn(), deletePosition: vi.fn(),
}))
import { getTrainings, deleteTraining } from '../../Trainings/api/trainingApi.js'
import { getPositions, createPosition, patchPosition } from '../../Positions/api/positionApi.js'
vi.mock('../api/dropReasonApi.js', () => ({
  getMemberDropReasons: vi.fn(), createMemberDropReason: vi.fn(), patchMemberDropReason: vi.fn(), deleteMemberDropReason: vi.fn(),
}))
import { getMemberDropReasons, patchMemberDropReason } from '../api/dropReasonApi.js'

const TRAININGS = [
  { trainingId: '1', name: 'Volunteer Training', description: 'Required.', holderCount: 560 },
  { trainingId: '4', name: 'LSC Training', description: null, holderCount: 0 },
]
const POSITIONS = [
  { positionId: '1', name: 'Steering Committee', description: null, scope: 'village', holderCount: 43, trainingIds: [] },
  { positionId: '5', name: 'Local Service Coordinator', description: null, scope: 'village', holderCount: 0, trainingIds: ['4'] },
  { positionId: '2', name: 'Board of Directors', description: null, scope: 'federation', holderCount: 0, trainingIds: [] },
]

beforeEach(() => {
  window.matchMedia = () => ({ matches: false, addEventListener () {}, removeEventListener () {} })
  globalThis.ResizeObserver = class { observe () {} unobserve () {} disconnect () {} }
  getTrainings.mockResolvedValue(TRAININGS)
  getPositions.mockResolvedValue(POSITIONS)
})
afterEach(() => { cleanup(); vi.clearAllMocks() })
const opts = (kind) => ({ props: { kind }, global: { plugins: [PrimeVue], directives: { tooltip: {} } } })

describe('CatalogAdmin — positions', () => {
  it('lists positions with Hub/Village labels and expected trainings', async () => {
    render(CatalogAdmin, opts('position'))
    expect(await screen.findByText('Steering Committee')).toBeInTheDocument()
    expect(screen.getByText('Hub')).toBeInTheDocument()
    expect(screen.getAllByText('Village').length).toBeGreaterThan(0)
    expect(screen.getByText('LSC Training')).toBeInTheDocument()
    expect(screen.getByText(/don.t grant access to Village Green/)).toBeInTheDocument()
  })

  it('disables delete on a held position', async () => {
    render(CatalogAdmin, opts('position'))
    await screen.findByText('Steering Committee')
    expect(screen.getByLabelText('Delete Steering Committee')).toBeDisabled()
    expect(screen.getByLabelText('Delete Board of Directors')).not.toBeDisabled()
  })

  it('inactive holders still block delete and scope, and show beside the count', async () => {
    getPositions.mockResolvedValue([{ ...POSITIONS[2], holderCount: 0, inactiveHolderCount: 1 }])
    render(CatalogAdmin, opts('position'))
    await screen.findByText('Board of Directors')
    expect(screen.getByText('+ 1 inactive')).toBeInTheDocument()
    expect(screen.getByLabelText('Delete Board of Directors')).toBeDisabled()
    await fireEvent.click(screen.getByLabelText('Edit Board of Directors'))
    expect(await screen.findByText('Scope can’t change while 1 volunteer (1 inactive) holds this position.')).toBeInTheDocument()
  })

  it('the locked-scope reason agrees with a single holder', async () => {
    getPositions.mockResolvedValue([{ ...POSITIONS[0], holderCount: 1 }])
    render(CatalogAdmin, opts('position'))
    await screen.findByText('Steering Committee')
    await fireEvent.click(screen.getByLabelText('Edit Steering Committee'))
    expect(await screen.findByText('Scope can’t change while 1 volunteer holds this position.')).toBeInTheDocument()
  })

  it('edit dialog on a held position locks scope with the reason and keeps trainingIds on save', async () => {
    patchPosition.mockResolvedValue({})
    render(CatalogAdmin, opts('position'))
    await screen.findByText('Steering Committee')
    await fireEvent.click(screen.getByLabelText('Edit Steering Committee'))
    expect(await screen.findByText('Scope can’t change while 43 volunteers hold this position.')).toBeInTheDocument()
    expect(screen.getByText(/Updating the name will update every one of their records/)).toBeInTheDocument()
    await fireEvent.click(screen.getByText('Save'))
    await waitFor(() => expect(patchPosition).toHaveBeenCalled())
    const [id, body] = patchPosition.mock.calls[0]
    expect(id).toBe('1')
    expect(body).toEqual({ name: 'Steering Committee', description: null, trainingIds: [] })
  })

  it('expected-trainings list offers every training and has no select-all', async () => {
    render(CatalogAdmin, opts('position'))
    await screen.findByText('Steering Committee')
    await fireEvent.click(screen.getByLabelText('Edit Steering Committee'))
    await screen.findByText('Trainings expected before assignment (optional)')
    await fireEvent.click(document.querySelector('#catalog-trainings'))
    const options = await screen.findAllByRole('option')
    expect(options.map(o => o.textContent.trim())).toEqual(['LSC Training', 'Volunteer Training'])
    expect(document.querySelector('.p-multiselect-header .p-checkbox')).toBeNull()
  })

  it('shows a duplicate-name 409 inline under Name', async () => {
    patchPosition.mockRejectedValue({ status: 409, body: { error: 'Conflict.', detail: 'A position named "Steering Committee" already exists.' } })
    render(CatalogAdmin, opts('position'))
    await screen.findByText('Steering Committee')
    await fireEvent.click(screen.getByLabelText('Edit Board of Directors'))
    await fireEvent.update(await screen.findByLabelText('Name'), 'Steering Committee')
    await fireEvent.click(screen.getByText('Save'))
    expect(await screen.findByText('A position named "Steering Committee" already exists.')).toBeInTheDocument()
  })

  it('a new position needs a scope before it is sent', async () => {
    render(CatalogAdmin, opts('position'))
    await screen.findByText('Steering Committee')
    await fireEvent.click(screen.getByText('Add position'))
    await fireEvent.update(await screen.findByLabelText('Name'), 'Newsletter Liaison')
    await fireEvent.click(screen.getByText('Add'))
    expect(await screen.findByText('Choose a scope.')).toBeInTheDocument()
    expect(createPosition).not.toHaveBeenCalled()
  })
})

describe('CatalogAdmin — trainings', () => {
  it('shows Expected for, and a linked delete names the positions in the confirm', async () => {
    deleteTraining.mockResolvedValue()
    render(CatalogAdmin, opts('training'))
    expect(await screen.findByText('Local Service Coordinator')).toBeInTheDocument()
    await fireEvent.click(screen.getByLabelText('Delete LSC Training'))
    expect(confirmRequire).toHaveBeenCalled()
    expect(confirmRequire.mock.calls[0][0].message).toMatch(/expected trainings of Local Service Coordinator/)
  })
})

describe('CatalogAdmin — member drop reasons', () => {
  const REASONS = [
    { memberDropReasonId: '1', name: 'Moved away', description: null, retired: false, holderCount: 3 },
    { memberDropReasonId: '2', name: 'Health', description: 'Illness.', retired: true, holderCount: 0 },
  ]
  const tipDirective = { tooltip: { mounted (el, b) { el.dataset.tip = b.value } } }
  beforeEach(() => { getMemberDropReasons.mockResolvedValue(REASONS) })

  it('memberDropReason kind lists reasons with Members count and Retired', async () => {
    render(CatalogAdmin, opts('memberDropReason'))
    expect(await screen.findByText('Moved away')).toBeInTheDocument()
    expect(screen.getByText('Drop Reasons')).toBeInTheDocument()
    expect(screen.getByText('Members')).toBeInTheDocument()
    expect(screen.getByText('Retired', { selector: 'th *' })).toBeInTheDocument()
    expect(screen.getByLabelText('Retired: Health')).toBeChecked()
    expect(screen.getByLabelText('Retired: Moved away')).not.toBeChecked()
    expect(screen.getByText('Add drop reason')).toBeInTheDocument()
    expect(getTrainings).not.toHaveBeenCalled()
  })

  it('retired toggle patches retired', async () => {
    patchMemberDropReason.mockResolvedValue({})
    render(CatalogAdmin, opts('memberDropReason'))
    await screen.findByText('Moved away')
    await fireEvent.click(screen.getByLabelText('Retired: Moved away'))
    await waitFor(() => expect(patchMemberDropReason).toHaveBeenCalledWith('1', { retired: true }))
  })

  it('delete blocked message names the member count', async () => {
    render(CatalogAdmin, { props: { kind: 'memberDropReason' }, global: { plugins: [PrimeVue], directives: tipDirective } })
    await screen.findByText('Moved away')
    const btn = screen.getByLabelText('Delete Moved away')
    expect(btn).toBeDisabled()
    expect(btn.closest('span').dataset.tip).toBe('Held by 3 members. Retire it instead.')
  })

  it('delete confirm for an unheld reason says no member has it', async () => {
    render(CatalogAdmin, opts('memberDropReason'))
    await screen.findByText('Health')
    await fireEvent.click(screen.getByLabelText('Delete Health'))
    expect(confirmRequire.mock.calls[0][0].message).toBe('Delete Health? No member has it, so nothing else changes.')
  })

  it('held edit note names members', async () => {
    render(CatalogAdmin, opts('memberDropReason'))
    await screen.findByText('Moved away')
    await fireEvent.click(screen.getByLabelText('Edit Moved away'))
    expect(await screen.findByText(/3 members have this drop reason\./)).toBeInTheDocument()
  })
})
