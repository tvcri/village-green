// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/vue'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import PrimeVue from 'primevue/config'
import PositionDetail from '../components/PositionDetail.vue'

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { positionId: '5' } }),
  useRouter: () => ({ push: vi.fn() }),
  onBeforeRouteLeave: vi.fn(),
}))
vi.mock('primevue/useconfirm', () => ({ useConfirm: () => ({ require: vi.fn() }) }))
vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: vi.fn() }) }))
vi.mock('../../../shared/composables/useCurrentUser.js', () => ({ useCurrentUser: () => ({ hasPermission: () => true }) }))
vi.mock('../api/positionApi.js', () => ({ getPositions: vi.fn(), getPositionHolders: vi.fn(), patchPositionHolders: vi.fn() }))
vi.mock('../../Trainings/api/trainingApi.js', () => ({ getTrainings: vi.fn(), getTrainingCompletions: vi.fn() }))
vi.mock('../../VolunteerList/api/volunteerApi.js', () => ({ getVolunteerRoster: vi.fn() }))
vi.mock('../../VillageList/api/villageApi.js', () => ({ getVillages: vi.fn() }))
vi.mock('../../PersonList/api/personApi.js', () => ({ getCircles: vi.fn() }))
import { getPositions, getPositionHolders, patchPositionHolders } from '../api/positionApi.js'
import { getTrainings, getTrainingCompletions } from '../../Trainings/api/trainingApi.js'
import { getVolunteerRoster } from '../../VolunteerList/api/volunteerApi.js'
import { getVillages } from '../../VillageList/api/villageApi.js'
import { getCircles } from '../../PersonList/api/personApi.js'

const barrington = { villageId: '1', name: 'Barrington' }
const bristol = { villageId: '3', name: 'Bristol-Warren' }
beforeEach(() => {
  window.matchMedia = () => ({ matches: false, addEventListener () {}, removeEventListener () {} })
  globalThis.ResizeObserver = class { observe () {} unobserve () {} disconnect () {} }
  getPositions.mockResolvedValue([{ positionId: '5', name: 'Local Service Coordinator', scope: 'village', trainingIds: ['4'], holderCount: 2 }])
  getTrainings.mockResolvedValue([{ trainingId: '4', name: 'LSC Training' }])
  getTrainingCompletions.mockResolvedValue([{ volunteerTrainingId: '9', completedDate: '2026-05-12', person: { personId: '1' } }])
  getVillages.mockResolvedValue([barrington, bristol, { villageId: '7', name: 'Warwick' }])
  getCircles.mockResolvedValue([])
  getPositionHolders.mockResolvedValue([
    { volunteerPositionId: '20', village: barrington, circle: null, person: { personId: '1', fullName: 'Abbott, Lorraine', displayName: 'Lorraine Abbott', village: barrington, active: true } },
    { volunteerPositionId: '21', village: bristol, circle: null, person: { personId: '8', fullName: 'Medeiros, Anthony', displayName: 'Anthony Medeiros', village: bristol, active: true } },
  ])
  getVolunteerRoster.mockResolvedValue([
    { personId: '5', fullName: 'Walsh, Bridget', displayName: 'Bridget Walsh', village: barrington, active: true, associateVillages: [] },
  ])
  patchPositionHolders.mockResolvedValue([])
})
afterEach(() => { cleanup(); vi.clearAllMocks() })
const opts = { global: { plugins: [PrimeVue], directives: { tooltip: {} } } }

describe('PositionDetail', () => {
  it('groups holders by village, lists empty villages, and shows training hints', async () => {
    render(PositionDetail, opts)
    expect(await screen.findByText('Abbott, Lorraine')).toBeInTheDocument()
    expect(screen.getByText('LSC Training · May 12, 2026')).toBeInTheDocument()
    expect(screen.getByText('No record of LSC Training')).toBeInTheDocument()
    expect(screen.getByText('Warwick')).toBeInTheDocument()
    expect(screen.getAllByText('No holders').length).toBe(1)
  })

  // Agreed with staff 2026-10-08: the add search lists only who can hold it
  // here, active volunteers of the village (own or associate), not greyed rows.
  it('the add search lists only active volunteers eligible for the village', async () => {
    getVolunteerRoster.mockResolvedValueOnce([
      { personId: '5', fullName: 'Walsh, Bridget', displayName: 'Bridget Walsh', village: barrington, active: true, associateVillages: [] },
      { personId: '6', fullName: 'Walsh, Ines', displayName: 'Ines Walsh', village: barrington, active: false, associateVillages: [] },
      { personId: '7', fullName: 'Walsh, Peter', displayName: 'Peter Walsh', village: bristol, active: true, associateVillages: [] },
      { personId: '9', fullName: 'Walsh, Ruth', displayName: 'Ruth Walsh', village: bristol, active: true, associateVillages: [barrington] },
    ])
    render(PositionDetail, opts)
    await screen.findByText('Abbott, Lorraine')
    await fireEvent.click(screen.getByLabelText('Add a holder in Barrington'))
    expect(screen.getByText('Lists active volunteers whose village or associate village is Barrington.')).toBeInTheDocument()
    const input = await screen.findByLabelText('Add a volunteer in Barrington')
    await fireEvent.focus(input)
    await fireEvent.update(input, 'walsh')
    const names = screen.getAllByRole('option').map(o => o.querySelector('.name').firstChild.textContent.trim())
    expect(names).toEqual(['Walsh, Bridget', 'Walsh, Ruth'])
  })

  it('stages an add and a removal, then saves both in one PATCH', async () => {
    render(PositionDetail, opts)
    await screen.findByText('Abbott, Lorraine')
    await fireEvent.click(screen.getByLabelText('Add a holder in Barrington'))
    const input = await screen.findByLabelText('Add a volunteer in Barrington')
    await fireEvent.focus(input)
    await fireEvent.update(input, 'wal')
    await fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getByText('New')).toBeInTheDocument()
    await fireEvent.click(screen.getByLabelText('Remove Anthony Medeiros from this position'))
    expect(screen.getByText('Will be removed')).toBeInTheDocument()
    expect(screen.getByText('1 to add, 1 to remove')).toBeInTheDocument()
    patchPositionHolders.mockResolvedValueOnce([
      { volunteerPositionId: '20', village: barrington, circle: null, person: { personId: '1', fullName: 'Abbott, Lorraine', displayName: 'Lorraine Abbott', village: barrington, active: true } },
      { volunteerPositionId: '30', village: barrington, circle: null, person: { personId: '5', fullName: 'Walsh, Bridget', displayName: 'Bridget Walsh', village: barrington, active: true } },
    ])
    await fireEvent.click(screen.getByText('Save'))
    await waitFor(() => expect(patchPositionHolders).toHaveBeenCalled())
    expect(patchPositionHolders.mock.calls[0]).toEqual(['5', { add: [{ personId: '5', villageId: '1', circleId: null }], remove: ['21'] }])
    await waitFor(() => expect(screen.getByText('Walsh, Bridget').closest('tr')).toHaveClass('flash'))
    expect(screen.getByText('Abbott, Lorraine').closest('tr')).not.toHaveClass('flash')
  })

  it('Undo restores a holder marked for removal', async () => {
    render(PositionDetail, opts)
    await screen.findByText('Abbott, Lorraine')
    await fireEvent.click(screen.getByLabelText('Remove Lorraine Abbott from this position'))
    await fireEvent.click(screen.getByText('Undo'))
    expect(screen.queryByText('Will be removed')).toBeNull()
  })
})
