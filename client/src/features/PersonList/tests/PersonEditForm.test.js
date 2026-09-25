// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/vue'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import PrimeVue from 'primevue/config'
import PersonEditForm from '../components/PersonEditForm.vue'

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ params: { personId: '5' } })
}))
vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: vi.fn() }) }))
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
