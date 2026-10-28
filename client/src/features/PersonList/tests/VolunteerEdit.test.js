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
      status: 'Active',
      dropReasonId: null,
      statusChangeNotes: null,
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
vi.mock('../../Admin/api/dropReasonApi.js', () => ({
  getVolunteerDropReasons: vi.fn().mockResolvedValue([
    { volunteerDropReasonId: '1', name: 'Moved', retired: false },
    { volunteerDropReasonId: '2', name: 'Too busy', retired: false },
  ]),
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
  it('shows the read-only note for a deceased person', async () => {
    getPerson.mockResolvedValueOnce({ personId: '5', fullName: 'Smith, Alice', village: { villageId: '1' }, deceased: true, deceasedDate: null })
    render(VolunteerEdit, { global: globalOpts })
    expect(await screen.findByText(/This person is marked deceased\. Their member and volunteer records can't be changed\./)).toBeInTheDocument()
    expect(screen.queryByText('Grant Volunteer Role')).toBeNull()
    expect(screen.queryByText('Save')).toBeNull()
  })

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

  it('save sends status, dropReasonId and statusChangeNotes, never active', async () => {
    render(VolunteerEdit, { global: globalOpts })
    await fireEvent.update(await screen.findByDisplayValue('Existing notes'), 'Updated notes')
    await fireEvent.click(document.querySelector('#status'))
    await fireEvent.mouseDown(await screen.findByRole('option', { name: 'Dropped' }))
    await fireEvent.click(await screen.findByLabelText('Select drop reason'))
    await fireEvent.mouseDown(await screen.findByRole('option', { name: 'Too busy' }))
    await fireEvent.update(document.querySelector('#statusChangeNotes'), 'Moved out of state')
    await fireEvent.click(screen.getByText('Save'))

    await waitFor(() => expect(patchVolunteer).toHaveBeenCalled())
    const [personId, body] = patchVolunteer.mock.calls[0]
    expect(personId).toBe('5')
    expect(body).toMatchObject({ notes: 'Updated notes', status: 'Dropped', dropReasonId: '2', statusChangeNotes: 'Moved out of state' })
    expect('active' in body).toBe(false)
  })

  it('new volunteer role defaults to Pending', async () => {
    getPerson.mockResolvedValueOnce({ personId: '5', fullName: 'Quinn, Robert', village: null, volunteer: null })
    render(VolunteerEdit, { global: globalOpts })
    await screen.findByText('Grant Volunteer Role')
    expect(document.querySelector('#status').textContent).toContain('Pending')
    await fireEvent.click(screen.getByText('Grant Volunteer Role'))
    await waitFor(() => expect(putVolunteer).toHaveBeenCalled())
    expect(putVolunteer.mock.calls[0][1].status).toBe('Pending')
    expect('active' in putVolunteer.mock.calls[0][1]).toBe(false)
  })

  it('dropping without a reason blocks save', async () => {
    render(VolunteerEdit, { global: globalOpts })
    await screen.findByDisplayValue('Existing notes')
    await fireEvent.click(document.querySelector('#status'))
    await fireEvent.mouseDown(await screen.findByRole('option', { name: 'Dropped' }))
    await fireEvent.click(screen.getByText('Save'))
    expect(await screen.findByText('A drop reason is required')).toBeInTheDocument()
    expect(patchVolunteer).not.toHaveBeenCalled()
  })

  it('picking a reason clears the drop-reason error', async () => {
    render(VolunteerEdit, { global: globalOpts })
    await screen.findByDisplayValue('Existing notes')
    await fireEvent.click(document.querySelector('#status'))
    await fireEvent.mouseDown(await screen.findByRole('option', { name: 'Dropped' }))
    await fireEvent.click(screen.getByText('Save'))
    expect(await screen.findByText('A drop reason is required')).toBeInTheDocument()
    await fireEvent.click(await screen.findByLabelText('Select drop reason'))
    await fireEvent.mouseDown(await screen.findByRole('option', { name: 'Too busy' }))
    await waitFor(() => expect(screen.queryByText('A drop reason is required')).toBeNull())
  })

  it('legacy dropped volunteer saves without choosing a reason', async () => {
    getPerson.mockResolvedValueOnce({
      personId: '5', fullName: 'Smith, Alice', village: { villageId: '1' },
      volunteer: {
        providerType: null, status: 'Dropped', dropReasonId: null, notes: 'Existing notes', statusChangeNotes: null,
        capabilities: [], vettings: [], trainings: [], associateVillages: [], positions: [],
      },
    })
    render(VolunteerEdit, { global: globalOpts })
    await fireEvent.update(await screen.findByDisplayValue('Existing notes'), 'Edited')
    await fireEvent.click(screen.getByText('Save'))
    await waitFor(() => expect(patchVolunteer).toHaveBeenCalled())
    expect(screen.queryByText('A drop reason is required')).toBeNull()
    expect(patchVolunteer.mock.calls[0][1]).toMatchObject({ status: 'Dropped' })
    expect('dropReasonId' in patchVolunteer.mock.calls[0][1]).toBe(false)
  })

  it('renders the form for a person with no home village (Hub volunteer)', async () => {
    getPerson.mockResolvedValueOnce({ personId: '5', fullName: 'Quinn, Robert', village: null, volunteer: null })
    render(VolunteerEdit, { global: globalOpts })
    expect(await screen.findByText('Grant Volunteer Role')).toBeInTheDocument()
    // Granting the role is the change: the button is live with nothing edited.
    expect(screen.getByRole('button', { name: 'Grant Volunteer Role' })).toBeEnabled()
    expect(screen.getByTestId('footer-note')).toHaveTextContent(/^$/)
    expect(screen.queryByText(/Set a home village/)).toBeNull()
  })

  it('sends trainings and positions on save', async () => {
    render(VolunteerEdit, { global: globalOpts })
    await fireEvent.update(await screen.findByDisplayValue('Existing notes'), 'Edited')
    await fireEvent.click(screen.getByText('Save'))
    await waitFor(() => expect(patchVolunteer).toHaveBeenCalled())
    const body = patchVolunteer.mock.calls[0][1]
    expect(body.trainings).toEqual([{ trainingId: '1', completedDate: '2025-04-25', notes: 'email' }])
    expect(body.positions).toEqual([{ positionId: '3', villageId: '7', circleId: null }])
  })

  // An open "new" row is not part of the form until its ✓ is pressed, so Save
  // waits rather than silently dropping it.
  it('blocks Save while a new vetting, training or position row is open', async () => {
    render(VolunteerEdit, { global: globalOpts })
    await fireEvent.update(await screen.findByDisplayValue('Existing notes'), 'Edited')
    const save = screen.getByRole('button', { name: 'Save' })
    expect(save).toBeEnabled()
    await fireEvent.click(screen.getByRole('button', { name: 'Add Position' }))
    expect(save).toBeDisabled()
    expect(screen.getByTestId('footer-note')).toHaveTextContent('Finish or cancel the new position first.')
    await fireEvent.click(screen.getByRole('button', { name: 'Add Training' }))
    expect(screen.getByTestId('footer-note')).toHaveTextContent('Finish or cancel the new training and position first.')
    await fireEvent.click(screen.getByRole('button', { name: 'Add Vetting' }))
    expect(screen.getByTestId('footer-note')).toHaveTextContent('Finish or cancel the new vetting, training and position first.')
    await fireEvent.click(screen.getByRole('button', { name: 'Cancel new position' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Cancel new training' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Cancel new vetting' }))
    expect(save).toBeEnabled()
    expect(screen.getByTestId('footer-note')).toHaveTextContent('notes edited')
  })

  it('says "No changes" and disables Save until something changes, then summarizes', async () => {
    render(VolunteerEdit, { global: globalOpts })
    await screen.findByDisplayValue('Existing notes')
    const save = screen.getByRole('button', { name: 'Save' })
    const note = screen.getByTestId('footer-note')
    expect(note).toHaveTextContent('No changes')
    expect(save).toBeDisabled()
    await fireEvent.click(screen.getByRole('button', { name: 'Remove Volunteer Training' }))
    await fireEvent.update(screen.getByDisplayValue('Existing notes'), 'Edited')
    expect(note).toHaveTextContent('1 training removed · notes edited')
    expect(save).toBeEnabled()
    await fireEvent.update(screen.getByDisplayValue('Edited'), 'Existing notes')
    expect(note).toHaveTextContent('1 training removed')
  })

  // Review Focus 3: a position its villages no longer cover is left out of
  // the PATCH (the server would 422 on it) and named in the toast.
  it('leaves out a position whose village is no longer covered, so the save does not 422', async () => {
    getPerson.mockResolvedValueOnce({
      personId: '5', fullName: 'Smith, Alice', village: { villageId: '1' },
      volunteer: {
        providerType: null, status: 'Active', notes: 'Existing notes', capabilities: [], vettings: [], trainings: [],
        associateVillages: [], // Warwick already removed in this form session
        positions: [{ volunteerPositionId: '3', positionId: '3', name: 'Member Ambassador', scope: 'village', village: { villageId: '7', name: 'Warwick' }, circle: null }],
      },
    })
    render(VolunteerEdit, { global: globalOpts })
    expect(await screen.findByText('Will be removed on save: Warwick is no longer one of this volunteer’s villages.')).toBeInTheDocument()
    // The pending removal is itself a change Save will make.
    expect(screen.getByTestId('footer-note')).toHaveTextContent('1 position removed')
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
    // Back where it started: nothing to save until something else changes.
    expect(screen.getByTestId('footer-note')).toHaveTextContent('No changes')
    await fireEvent.update(screen.getByDisplayValue('Existing notes'), 'Edited')

    await fireEvent.click(screen.getByText('Save'))
    await waitFor(() => expect(patchVolunteer).toHaveBeenCalled())
    const body = patchVolunteer.mock.calls[0][1]
    expect(body.associateVillageIds).toEqual(['7'])
    expect(body.positions).toEqual([{ positionId: '3', villageId: '7', circleId: null }])
    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ severity: 'success', detail: 'Volunteer role saved' }))
  })
})
