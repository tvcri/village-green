// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/vue'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import PrimeVue from 'primevue/config'
import { onBeforeRouteLeave } from 'vue-router'
import TrainingDetail from '../components/TrainingDetail.vue'

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { trainingId: '4' } }),
  useRouter: () => ({ push: vi.fn() }),
  onBeforeRouteLeave: vi.fn(),
}))
vi.mock('primevue/useconfirm', () => ({ useConfirm: () => ({ require: vi.fn() }) }))
vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: vi.fn() }) }))
vi.mock('../../../shared/composables/useCurrentUser.js', () => ({ useCurrentUser: () => ({ hasPermission: () => true }) }))
vi.mock('../api/trainingApi.js', () => ({
  getTrainings: vi.fn(), getTrainingCompletions: vi.fn(), recordTrainingCompletions: vi.fn(), deleteTrainingCompletion: vi.fn(),
}))
vi.mock('../../Positions/api/positionApi.js', () => ({ getPositions: vi.fn(), getPositionHolders: vi.fn() }))
vi.mock('../../VolunteerList/api/volunteerApi.js', () => ({ getVolunteerRoster: vi.fn() }))
import { getTrainings, getTrainingCompletions, recordTrainingCompletions } from '../api/trainingApi.js'
import { getPositions, getPositionHolders } from '../../Positions/api/positionApi.js'
import { getVolunteerRoster } from '../../VolunteerList/api/volunteerApi.js'

const barrington = { villageId: '1', name: 'Barrington' }
beforeEach(() => {
  window.matchMedia = () => ({ matches: false, addEventListener () {}, removeEventListener () {} })
  globalThis.ResizeObserver = class { observe () {} unobserve () {} disconnect () {} }
  getTrainings.mockResolvedValue([{ trainingId: '4', name: 'LSC Training', description: 'Prepares LSCs.', holderCount: 1 }])
  getPositions.mockResolvedValue([{ positionId: '5', name: 'Local Service Coordinator', scope: 'village', trainingIds: ['4'], holderCount: 1 }])
  getTrainingCompletions.mockResolvedValue([
    { volunteerTrainingId: '9', completedDate: '2026-05-12', notes: null,
      person: { personId: '1', fullName: 'Abbott, Lorraine', displayName: 'Lorraine Abbott', village: barrington, active: true } },
  ])
  getVolunteerRoster.mockResolvedValue([
    { personId: '1', fullName: 'Abbott, Lorraine', displayName: 'Lorraine Abbott', village: barrington, active: true, associateVillages: [] },
    { personId: '3', fullName: 'Nguyen, Linh', displayName: 'Linh Nguyen', village: { villageId: '7', name: 'Warwick' }, active: true, associateVillages: [] },
    { personId: '16', fullName: 'Quinn, Robert', displayName: 'Robert Quinn', village: null, active: true, associateVillages: [] },
  ])
  getPositionHolders.mockResolvedValue([{ volunteerPositionId: '20', village: barrington, circle: null, person: { personId: '1' } }])
  recordTrainingCompletions.mockResolvedValue({ recorded: ['3', '16'], skipped: [], assigned: ['3'], notAssigned: [{ personId: '16', reason: 'noHomeVillage' }] })
})
afterEach(() => { cleanup(); vi.clearAllMocks() })
const opts = { global: { plugins: [PrimeVue], directives: { tooltip: {} } } }

// By label: the page's village filter is a PrimeVue Select, which also has role combobox.
async function addByName (text) {
  const input = screen.getByLabelText('Add volunteers')
  await fireEvent.focus(input)
  await fireEvent.update(input, text)
  await fireEvent.keyDown(input, { key: 'Enter' })
}

describe('TrainingDetail', () => {
  it('lists completions and the linked position', async () => {
    render(TrainingDetail, opts)
    expect(await screen.findByText('Abbott, Lorraine')).toBeInTheDocument()
    expect(screen.getByText('May 12, 2026')).toBeInTheDocument()
    expect(screen.getByText('Local Service Coordinator')).toBeInTheDocument()
  })

  it('records a batch with an also-assign position and shows per-person flags', async () => {
    render(TrainingDetail, opts)
    await screen.findByText('Abbott, Lorraine')
    await fireEvent.click(screen.getByText('Record completions'))
    await waitFor(() => expect(getVolunteerRoster).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByLabelText('Add volunteers')).toBeInTheDocument())
    await fireEvent.click(screen.getByLabelText(/Local Service Coordinator \(Village\)/))
    await waitFor(() => expect(getPositionHolders).toHaveBeenCalledWith('5'))
    await addByName('nguy')
    await addByName('quinn')
    expect(screen.getByText('Will be assigned · Warwick')).toBeInTheDocument()
    expect(screen.getByText('Not assigned: no home village')).toBeInTheDocument()
    expect(screen.getAllByText('First completion')).toHaveLength(2)
    await fireEvent.click(screen.getByText('Save'))
    await waitFor(() => expect(recordTrainingCompletions).toHaveBeenCalled())
    const [trainingId, body] = recordTrainingCompletions.mock.calls[0]
    expect(trainingId).toBe('4')
    expect(body.personIds).toEqual(['3', '16'])
    expect(body.positionId).toBe('5')
    expect(body.completedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  // The guard callback useUnsavedChangesGuard registered; true = leave without asking.
  const leaveGuard = () => onBeforeRouteLeave.mock.calls.at(-1)[0]

  async function openPanelAndAdd () {
    render(TrainingDetail, opts)
    await screen.findByText('Abbott, Lorraine')
    await fireEvent.click(screen.getByText('Record completions'))
    await waitFor(() => expect(screen.getByLabelText('Add volunteers')).toBeInTheDocument())
    await addByName('nguy')
    await screen.findByText('Nguyen, Linh')
    expect(leaveGuard()()).toBeInstanceOf(Promise) // dirty while staged: asks first
  }

  it('is not dirty after a successful save (breadcrumb leaves without a prompt)', async () => {
    await openPanelAndAdd()
    await fireEvent.click(screen.getByText('Save'))
    await waitFor(() => expect(screen.queryByText('Save')).not.toBeInTheDocument())
    expect(leaveGuard()()).toBe(true)
  })

  it('is not dirty after Discard', async () => {
    await openPanelAndAdd()
    await fireEvent.click(screen.getByText('Discard'))
    await waitFor(() => expect(screen.queryByText('Save')).not.toBeInTheDocument())
    expect(leaveGuard()()).toBe(true)
  })
})
