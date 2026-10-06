// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/vue'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import PrimeVue from 'primevue/config'
import VolunteerEdit from '../components/VolunteerEdit.vue'

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ params: { personId: '5' } })
}))
const toastAdd = vi.hoisted(() => vi.fn())
vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: toastAdd }) }))
vi.mock('../../../shared/composables/useRequirePermission.js', () => ({
  useRequirePermission: () => {}
}))
vi.mock('../api/personApi.js', () => ({
  getPerson: vi.fn().mockResolvedValue({
    personId: '5',
    fullName: 'Smith, Alice',
    village: { villageId: '1' },
    volunteer: {
      providerType: 'Member Volunteer',
      active: true,
      notes: 'Existing notes',
      capabilities: ['Driving'],
      vettings: [],
      trainings: [{ volunteerTrainingId: '9', trainingId: '1', name: 'Volunteer Training', completedDate: '2025-04-25', notes: 'email' }],
      positions: [{ volunteerPositionId: '3', positionId: '3', name: 'Member Ambassador', scope: 'village', village: { villageId: '7', name: 'Warwick' }, circle: null }],
      associateVillages: [{ villageId: '7', name: 'Warwick' }],
    }
  }),
  getCapabilities: vi.fn().mockResolvedValue([
    { capabilityId: 1, name: 'Driving' },
    { capabilityId: 2, name: 'Errands' }
  ]),
  getVettingTypes: vi.fn().mockResolvedValue([]),
  getCircles: vi.fn().mockResolvedValue([]),
}))
vi.mock('../api/roleApi.js', () => ({
  putVolunteer: vi.fn().mockResolvedValue({}),
  patchVolunteer: vi.fn().mockResolvedValue({}),
  deleteVolunteer: vi.fn().mockResolvedValue({})
}))
vi.mock('../../VillageList/api/villageApi.js', () => ({
  getVillages: vi.fn().mockResolvedValue([{ villageId: '1', name: 'Testville' }, { villageId: '7', name: 'Warwick' }])
}))
vi.mock('../../Trainings/api/trainingApi.js', () => ({ getTrainings: vi.fn().mockResolvedValue([{ trainingId: '1', name: 'Volunteer Training' }]) }))
vi.mock('../../Positions/api/positionApi.js', () => ({ getPositions: vi.fn().mockResolvedValue([{ positionId: '3', name: 'Member Ambassador', scope: 'village', trainingIds: [] }]) }))

import { getPerson } from '../api/personApi.js'
import { putVolunteer, patchVolunteer } from '../api/roleApi.js'

beforeEach(() => {
  window.matchMedia = () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {}
  })
  // jsdom has no ResizeObserver; PrimeVue MultiSelect observes on mount.
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

describe('VolunteerEdit', () => {
  // A failed load leaves person null, so the Loading notice replaces the
  // form: no Save or Grant button exists to PUT a new role over the stored one.
  it('a failed person load renders no save button, so it can never PUT a role', async () => {
    getPerson.mockRejectedValueOnce(new Error('down'))
    render(VolunteerEdit, { global: globalOpts })
    await waitFor(() => expect(getPerson).toHaveBeenCalled())
    await new Promise(r => setTimeout(r, 0))
    expect(screen.queryByText('Grant Volunteer Role')).toBeNull()
    expect(screen.queryByText('Save')).toBeNull()
    expect(putVolunteer).not.toHaveBeenCalled()
    expect(patchVolunteer).not.toHaveBeenCalled()
  })

  it('loads and displays the existing volunteer values', async () => {
    render(VolunteerEdit, { global: globalOpts })
    await waitFor(() => expect(screen.getByDisplayValue('Existing notes')).toBeInTheDocument())
    expect(screen.getByText('Driving')).toBeInTheDocument()
  })

  it('saves edited notes and toggled active checkbox', async () => {
    const { patchVolunteer } = await import('../api/roleApi.js')
    render(VolunteerEdit, { global: globalOpts })

    const notesInput = await screen.findByDisplayValue('Existing notes')
    await fireEvent.update(notesInput, 'Updated notes')

    const activeLabel = screen.getByText('Active').closest('label')
    const activeCheckbox = activeLabel.querySelector('input[type="checkbox"]')
    await fireEvent.click(activeCheckbox)

    await fireEvent.click(screen.getByText('Save'))

    await waitFor(() => expect(patchVolunteer).toHaveBeenCalled())
    const [personId, body] = patchVolunteer.mock.calls[0]
    expect(personId).toBe('5')
    expect(body.notes).toBe('Updated notes')
    expect(body.active).toBe(false)
  })

  it('renders the form for a person with no home village (Hub volunteer)', async () => {
    getPerson.mockResolvedValueOnce({ personId: '5', fullName: 'Quinn, Robert', village: null, volunteer: null })
    render(VolunteerEdit, { global: globalOpts })
    expect(await screen.findByText('Grant Volunteer Role')).toBeInTheDocument()
    expect(screen.queryByText(/Set a home village/)).toBeNull()
  })

  it('sends trainings and positions on save', async () => {
    render(VolunteerEdit, { global: globalOpts })
    await screen.findByDisplayValue('Existing notes')
    await fireEvent.click(screen.getByText('Save'))
    await waitFor(() => expect(patchVolunteer).toHaveBeenCalled())
    const body = patchVolunteer.mock.calls[0][1]
    expect(body.trainings).toEqual([{ trainingId: '1', completedDate: '2025-04-25', notes: 'email' }])
    expect(body.positions).toEqual([{ positionId: '3', villageId: '7', circleId: null }])
  })

  // Review Focus 3: a position its villages no longer cover is left out of
  // the PATCH (the server would 422 on it) and named in the toast.
  it('leaves out a position whose village is no longer covered, so the save does not 422', async () => {
    getPerson.mockResolvedValueOnce({
      personId: '5', fullName: 'Smith, Alice', village: { villageId: '1' },
      volunteer: {
        providerType: null, active: true, notes: 'Existing notes', capabilities: [], vettings: [], trainings: [],
        associateVillages: [], // Warwick already removed in this form session
        positions: [{ volunteerPositionId: '3', positionId: '3', name: 'Member Ambassador', scope: 'village', village: { villageId: '7', name: 'Warwick' }, circle: null }],
      },
    })
    render(VolunteerEdit, { global: globalOpts })
    expect(await screen.findByText('Will be removed on save: Warwick is no longer one of this volunteer’s villages.')).toBeInTheDocument()
    await fireEvent.click(screen.getByText('Save'))
    await waitFor(() => expect(patchVolunteer).toHaveBeenCalled())
    expect(patchVolunteer.mock.calls[0][1].positions).toEqual([])
    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({
      severity: 'success', detail: 'Volunteer role saved. Removed Member Ambassador, Warwick.',
    }))
  })

  // Review Focus 3, second half: removing the associate village and re-adding
  // it before save keeps the position, and the toast names no removal.
  it('keeps a position when its associate village is removed and re-added before save', async () => {
    const { container } = render(VolunteerEdit, { global: globalOpts })
    await screen.findByDisplayValue('Existing notes')
    const chip = [...container.querySelectorAll('.p-multiselect-chip-item')].find(e => e.textContent.includes('Warwick'))
    await fireEvent.click(chip.querySelector('.p-chip-remove-icon'))
    expect(await screen.findByText(/Will be removed on save: Warwick/)).toBeInTheDocument()

    await fireEvent.click(container.querySelector('#associateVillages'))
    const option = (await screen.findAllByRole('option')).find(o => o.textContent.includes('Warwick'))
    await fireEvent.click(option)
    await waitFor(() => expect(screen.queryByText(/Will be removed on save/)).toBeNull())

    await fireEvent.click(screen.getByText('Save'))
    await waitFor(() => expect(patchVolunteer).toHaveBeenCalled())
    const body = patchVolunteer.mock.calls[0][1]
    expect(body.associateVillageIds).toEqual(['7'])
    expect(body.positions).toEqual([{ positionId: '3', villageId: '7', circleId: null }])
    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ severity: 'success', detail: 'Volunteer role saved' }))
  })
})
