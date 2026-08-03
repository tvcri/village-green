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
vi.mock('../api/personApi.js', () => ({
  getPerson: vi.fn().mockResolvedValue({
    personId: '5',
    firstName: 'Alice',
    lastName: 'Smith',
    email: 'alice@example.com',
    phone: '555-0100',
    village: { villageId: '1' },
    communities: [{ name: 'Pride' }],
    disabilities: [{ name: 'Vision', note: 'reading glasses' }]
  }),
  createPerson: vi.fn().mockResolvedValue({ personId: '5' }),
  patchPerson: vi.fn().mockResolvedValue({}),
  getCommunities: vi.fn().mockResolvedValue([{ communityId: 1, name: 'Pride' }, { communityId: 2, name: 'Veteran' }]),
  getDisabilities: vi.fn().mockResolvedValue([{ disabilityId: 1, name: 'Vision' }])
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

  it('toggles the Veteran community checkbox into the saved payload', async () => {
    const { patchPerson } = await import('../api/personApi.js')
    render(PersonEditForm, { global: globalOpts })

    await screen.findByDisplayValue('Alice')
    const veteranLabel = screen.getByText('Veteran').closest('label')
    const veteranCheckbox = veteranLabel.querySelector('input[type="checkbox"]')
    await fireEvent.click(veteranCheckbox)

    await fireEvent.click(screen.getByText('Save'))

    await waitFor(() => expect(patchPerson).toHaveBeenCalled())
    const [, body] = patchPerson.mock.calls[0]
    expect(body.communities).toEqual(expect.arrayContaining([1, 2]))
  })
})
