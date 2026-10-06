// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/vue'
import { h } from 'vue'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import PrimeVue from 'primevue/config'
import PersonEditForm from '../components/PersonEditForm.vue'
import { _resetPersonLookups } from '../composables/usePersonLookups.js'

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ params: { personId: '5' } })
}))
const confirmRequire = vi.fn()
vi.mock('primevue/useconfirm', () => ({ useConfirm: () => ({ require: confirmRequire }) }))
const mockToastAdd = vi.fn()
vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: mockToastAdd }) }))
vi.mock('../../../shared/composables/useRequirePermission.js', () => ({
  useRequirePermission: () => {}
}))
const mockHasPermission = vi.fn(() => true)
vi.mock('../../../shared/composables/useCurrentUser.js', () => ({
  useCurrentUser: () => ({ hasPermission: mockHasPermission }),
}))
vi.mock('../api/personApi.js', () => ({
  getPerson: vi.fn().mockResolvedValue({
    personId: '5',
    firstName: 'Alice',
    lastName: 'Smith',
    email: 'alice@example.com',
    phone: '555-0100',
    village: { villageId: '1' },
    circles: [{ circleId: '1', name: 'Circle of Pride' }],
    disabilities: [{ name: 'Vision', note: 'reading glasses' }],
    suffix: 'Jr.',
    pronouns: 'she/her',
    gender: { genderId: '1', name: 'Female' },
    isVeteran: false,
    races: [],
    languages: [{ languageId: '1', name: 'English', tag: 'en', isPreferred: true }],
  }),
  createPerson: vi.fn().mockResolvedValue({ personId: '5' }),
  patchPerson: vi.fn().mockResolvedValue({}),
  getCircles: vi.fn().mockResolvedValue([
    { circleId: '1', name: 'Circle of Pride' }, { circleId: '2', name: "Veteran's Circle" },
    { circleId: '3', name: 'DownCity' }, { circleId: '4', name: 'OakHill' },
  ]),
  getDisabilities: vi.fn().mockResolvedValue([{ disabilityId: 1, name: 'Vision' }]),
  getGenders: vi.fn().mockResolvedValue([{ genderId: '1', name: 'Female' }, { genderId: '2', name: 'Male' }]),
  getEthnicities: vi.fn().mockResolvedValue([]),
  getRaces: vi.fn().mockResolvedValue([{ raceId: '1', name: 'Asian' }]),
  getContactMethods: vi.fn().mockResolvedValue([{ contactMethodId: '1', name: 'Phone' }]),
  getLanguages: vi.fn().mockResolvedValue([{ languageId: '1', name: 'English', tag: 'en' }, { languageId: '2', name: 'Spanish', tag: 'es' }]),
}))
vi.mock('../../VillageList/api/villageApi.js', () => ({
  getVillages: vi.fn().mockResolvedValue([{ villageId: '1', name: 'Testville' }])
}))

beforeEach(() => {
  window.matchMedia = () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {}
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const globalOpts = {
  plugins: [PrimeVue],
  directives: { tooltip: {}, Tooltip: {} }
}

describe('PersonEditForm', () => {
  it('a failed load toasts and keeps Save disabled, so a blank form never PATCHes nulls', async () => {
    const { getGenders, patchPerson } = await import('../api/personApi.js')
    _resetPersonLookups()
    getGenders.mockRejectedValueOnce(new Error('catalog down'))
    render(PersonEditForm, { global: globalOpts })

    await waitFor(() => expect(mockToastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'error', detail: 'Failed to load person' })))
    const save = screen.getByText('Save').closest('button')
    expect(save).toBeDisabled()
    await fireEvent.click(save)
    expect(patchPerson).not.toHaveBeenCalled()
    _resetPersonLookups()
  })

  it('enables Save once the person has loaded', async () => {
    render(PersonEditForm, { global: globalOpts })
    await screen.findByDisplayValue('Alice')
    expect(screen.getByText('Save').closest('button')).toBeEnabled()
  })

  it('loads and displays the existing person values', async () => {
    render(PersonEditForm, { global: globalOpts })
    await waitFor(() => expect(screen.getByDisplayValue('Alice')).toBeInTheDocument())
    expect(screen.getByDisplayValue('Smith')).toBeInTheDocument()
    expect(screen.getByDisplayValue('alice@example.com')).toBeInTheDocument()
  })

  it('saves edited name and email fields in the patch payload', async () => {
    const { patchPerson } = await import('../api/personApi.js')
    render(PersonEditForm, { global: globalOpts })

    const firstNameInput = await screen.findByDisplayValue('Alice')
    await fireEvent.update(firstNameInput, 'Alicia')

    const emailInput = screen.getByDisplayValue('alice@example.com')
    await fireEvent.update(emailInput, 'alicia@example.com')

    await fireEvent.click(screen.getByText('Save'))

    await waitFor(() => expect(patchPerson).toHaveBeenCalled())
    const [personId, body] = patchPerson.mock.calls[0]
    expect(personId).toBe('5')
    expect(body.firstName).toBe('Alicia')
    expect(body.email).toBe('alicia@example.com')
  })

  it('renders one circle checkbox per catalog row and saves toggles under circles', async () => {
    const { patchPerson } = await import('../api/personApi.js')
    render(PersonEditForm, { global: globalOpts })
    await screen.findByDisplayValue('Alice')
    for (const name of ['Circle of Pride', "Veteran's Circle", 'DownCity', 'OakHill']) {
      expect(screen.getByText(name)).toBeInTheDocument()
    }
    const prideBox = screen.getByText('Circle of Pride').closest('label').querySelector('input[type="checkbox"]')
    expect(prideBox.checked).toBe(true)
    const vetBox = screen.getByText("Veteran's Circle").closest('label').querySelector('input[type="checkbox"]')
    await fireEvent.click(vetBox)
    await fireEvent.click(screen.getByText('Save'))
    await waitFor(() => expect(patchPerson).toHaveBeenCalled())
    const [, body] = patchPerson.mock.calls[0]
    expect(body.circles).toEqual(expect.arrayContaining(['1', '2']))
    expect(body.circles).toHaveLength(2)
    expect('communities' in body).toBe(false)
  })

  it('hides the birth date input and never sends birthDate without person:read_birth_date', async () => {
    mockHasPermission.mockImplementation((key) => key !== 'person:read_birth_date')
    const { patchPerson } = await import('../api/personApi.js')
    render(PersonEditForm, { global: globalOpts })
    await screen.findByDisplayValue('Alice')
    expect(document.getElementById('birthDate')).toBeNull()
    await fireEvent.click(screen.getByText('Save'))
    await waitFor(() => expect(patchPerson).toHaveBeenCalled())
    const [, body] = patchPerson.mock.calls[0]
    expect('birthDate' in body).toBe(false)
    mockHasPermission.mockImplementation(() => true)
  })

  it('shows the birth date input with the key', async () => {
    render(PersonEditForm, { global: globalOpts })
    await screen.findByDisplayValue('Alice')
    expect(document.getElementById('birthDate')).not.toBeNull()
  })

  it('loads the 0027 fields and saves them back unchanged', async () => {
    const { patchPerson } = await import('../api/personApi.js')
    render(PersonEditForm, { global: globalOpts })
    await screen.findByDisplayValue('Jr.')
    expect(screen.getByDisplayValue('she/her')).toBeInTheDocument()
    await fireEvent.click(screen.getByText('Save'))
    await waitFor(() => expect(patchPerson).toHaveBeenCalled())
    const [, body] = patchPerson.mock.calls[0]
    expect(body.suffix).toBe('Jr.')
    expect(body.genderId).toBe('1')
    expect(body.isVeteran).toBe(false)
    expect(body.races).toEqual([])
    expect(body.languages).toEqual([{ languageId: '1', isPreferred: true }])
  })

  it('omits demographics without person:read_demographics', async () => {
    mockHasPermission.mockImplementation((key) => key !== 'person:read_demographics')
    const { patchPerson } = await import('../api/personApi.js')
    render(PersonEditForm, { global: globalOpts })
    await screen.findByDisplayValue('Jr.')
    expect(screen.queryByText('Demographics')).toBeNull()
    await fireEvent.click(screen.getByText('Save'))
    await waitFor(() => expect(patchPerson).toHaveBeenCalled())
    const [, body] = patchPerson.mock.calls[0]
    for (const k of ['genderId', 'ethnicityId', 'isVeteran', 'races']) expect(k in body).toBe(false)
    mockHasPermission.mockImplementation(() => true)
  })

  it('saves a record whose first name is NULL, sending firstName null', async () => {
    const { getPerson, patchPerson } = await import('../api/personApi.js')
    getPerson.mockResolvedValueOnce({
      personId: '5', firstName: null, lastName: 'Smith', village: { villageId: '1' },
      circles: [], disabilities: [], languages: [],
    })
    render(PersonEditForm, { global: globalOpts })
    await screen.findByDisplayValue('Smith')
    await fireEvent.click(screen.getByText('Save'))
    await waitFor(() => expect(patchPerson).toHaveBeenCalled())
    expect(patchPerson.mock.calls[0][1].firstName).toBeNull()
  })
})

describe('home village change removes positions', () => {
  const editPerson = () => ({
    personId: '5', firstName: 'Lorraine', lastName: 'Abbott', displayName: 'Lorraine Abbott',
    village: { villageId: '1', name: 'Barrington' }, circles: [], disabilities: [],
    volunteer: {
      associateVillages: [{ villageId: '7', name: 'Warwick' }],
      positions: [
        { volunteerPositionId: '1', positionId: '1', name: 'Steering Committee', scope: 'village', village: { villageId: '1', name: 'Barrington' }, circle: null },
        { volunteerPositionId: '2', positionId: '3', name: 'Member Ambassador', scope: 'village', village: { villageId: '7', name: 'Warwick' }, circle: null },
      ],
    },
  })
  // Stand-in for PersonFormFields: one button emits the Village select's "cleared" event.
  const FieldsStub = {
    props: ['villageWarning'],
    emits: ['update:villageId'],
    setup: (props, { emit, expose }) => {
      expose({ townSettled: async () => {} })
      return () => h('div', [
      h('button', { 'data-testid': 'clear-village', onClick: () => emit('update:villageId', null) }, 'clear'),
      h('small', props.villageWarning),
    ])
    },
  }
  const renderEdit = async (person) => {
    const { getPerson } = await import('../api/personApi.js')
    const { getVillages } = await import('../../VillageList/api/villageApi.js')
    getPerson.mockResolvedValueOnce(person)
    getVillages.mockResolvedValueOnce([{ villageId: '1', name: 'Barrington' }, { villageId: '7', name: 'Warwick' }])
    render(PersonEditForm, { global: { ...globalOpts, stubs: { PersonFormFields: FieldsStub } } })
    await waitFor(() => expect(getPerson).toHaveBeenCalledWith('5', ['volunteer']))
    await waitFor(() => expect(screen.getByText('Save').closest('button')).toBeEnabled())
  }

  it('warns under Village and confirms before saving; Keep editing does not save', async () => {
    const { patchPerson } = await import('../api/personApi.js')
    await renderEdit(editPerson())
    await fireEvent.click(screen.getByTestId('clear-village'))
    expect(await screen.findByText('Saving will remove 1 position that depends on Barrington: Steering Committee.')).toBeInTheDocument()
    await fireEvent.click(screen.getByText('Save'))
    await waitFor(() => expect(confirmRequire).toHaveBeenCalled())
    const args = confirmRequire.mock.calls[0][0]
    expect(args.message).toBe('Change the home village to no village? Lorraine Abbott will no longer hold: Steering Committee (Barrington).')
    expect(args.acceptLabel).toBe('Change village and remove')
    args.reject()
    await Promise.resolve()
    expect(patchPerson).not.toHaveBeenCalled()
  })

  it('saves and names the removed positions once the confirm is accepted', async () => {
    const { patchPerson } = await import('../api/personApi.js')
    await renderEdit(editPerson())
    await fireEvent.click(screen.getByTestId('clear-village'))
    await fireEvent.click(screen.getByText('Save'))
    await waitFor(() => expect(confirmRequire).toHaveBeenCalled())
    confirmRequire.mock.calls[0][0].accept()
    await waitFor(() => expect(patchPerson).toHaveBeenCalled())
    expect(mockToastAdd).toHaveBeenCalledWith(expect.objectContaining({
      detail: 'Person updated. Removed Steering Committee (Barrington).' }))
  })

  it('no warning when the change keeps every position', async () => {
    const p = editPerson(); p.volunteer.positions = p.volunteer.positions.slice(1)
    await renderEdit(p)
    await fireEvent.click(screen.getByTestId('clear-village'))
    expect(screen.queryByText(/Saving will remove/)).toBeNull()
    await fireEvent.click(screen.getByText('Save'))
    expect(confirmRequire).not.toHaveBeenCalled()
  })
})
