// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/vue'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import PrimeVue from 'primevue/config'
import VolunteerStep from './VolunteerStep.vue'
import { _resetPersonLookups } from '../../PersonList/composables/usePersonLookups.js'

vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: vi.fn() }) }))
const mockHasPermission = vi.fn(() => true)
vi.mock('../../../shared/composables/useCurrentUser.js', () => ({
  useCurrentUser: () => ({ hasPermission: mockHasPermission }),
}))
vi.mock('../../PersonList/api/personApi.js', () => ({
  getPersons: vi.fn().mockResolvedValue([]),
  createPerson: vi.fn(),
  patchPerson: vi.fn().mockResolvedValue({}),
  getDisabilities: vi.fn().mockResolvedValue([]),
  getCapabilities: vi.fn().mockResolvedValue([{ capabilityId: '3', name: 'Errands' }, { capabilityId: '4', name: 'Rides' }]),
  geocodeTown: vi.fn().mockResolvedValue({ town: null }),
  getGenders: vi.fn().mockResolvedValue([{ genderId: '1', name: 'Female' }, { genderId: '2', name: 'Male' }]),
  getEthnicities: vi.fn().mockResolvedValue([]),
  getRaces: vi.fn().mockResolvedValue([]),
  getContactMethods: vi.fn().mockResolvedValue([]),
  getLanguages: vi.fn().mockResolvedValue([]),
}))
vi.mock('../../PersonList/api/roleApi.js', () => ({
  putVolunteer: vi.fn().mockResolvedValue({}),
  patchVolunteer: vi.fn().mockResolvedValue({}),
}))
vi.mock('../../VillageList/api/villageApi.js', () => ({
  getVillages: vi.fn().mockResolvedValue([{ villageId: '7', name: 'Barrington' }]),
}))

import { getPersons, createPerson } from '../../PersonList/api/personApi.js'
import { putVolunteer, patchVolunteer } from '../../PersonList/api/roleApi.js'

const extraction = () => ({
  applicationType: 'volunteer', schemaVersion: 1, extractedAt: '2026-09-25T00:00:00.000Z',
  application: { applicationDate: '2026-05-30', village: { villageId: '7', villageName: 'Barrington' }, ambassador: null },
  person: {
    firstName: 'Nicole', middleInitial: 'K', lastName: 'Brown', nickname: null,
    pronouns: 'she/her', birthDate: '1999-07-10', gender: 'Female', veteran: 'No',
    language: null, street: null, unit: null, city: null, state: null, zip: null,
    email: null, phone: null, cell: null,
  },
  emergencyContact: null,
  capabilityNames: ['Errands'],
  circleOfPrideJoin: 'No',
  notes: 'Prefers weekday mornings',
  uncertainFields: [],
})

function mount () {
  return render(VolunteerStep, {
    props: { extraction: extraction() },
    global: { plugins: [PrimeVue], directives: { tooltip: {} } },
  })
}

beforeEach(() => {
  window.matchMedia = () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} })
  _resetPersonLookups()
  mockHasPermission.mockReturnValue(true)
  createPerson.mockResolvedValue({ personId: '42', fullName: 'Brown, Nicole' })
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('VolunteerStep', () => {
  it('creates the person with prefilled extras, then grants the role with capabilities and the application', async () => {
    const { emitted } = mount()
    await screen.findByDisplayValue('Brown')
    await waitFor(() => expect(screen.getByText('Female')).toBeInTheDocument())
    await fireEvent.click(screen.getByText('Create Person & Grant Volunteer Role'))
    await waitFor(() => expect(putVolunteer).toHaveBeenCalled())

    expect(createPerson.mock.calls[0][0]).toMatchObject({ firstName: 'Nicole', pronouns: 'she/her', genderId: '1', isVeteran: false })
    const [personId, body] = putVolunteer.mock.calls[0]
    expect(personId).toBe('42')
    expect(body.capabilityIds).toEqual(['3'])
    expect(body.notes).toBe('Prefers weekday mornings')
    expect(body.application).toMatchObject({ applicationType: 'volunteer', memberIndex: null })
    expect(emitted()['volunteer-done'][0][0]).toEqual({ personId: '42', fullName: 'Brown, Nicole' })
  })

  it('an existing match is patched, not replaced, and named by its own record', async () => {
    getPersons.mockResolvedValue([{ personId: '9', fullName: 'Brown, Nicole K.', village: { name: 'Barrington' } }])
    const { emitted } = mount()
    await fireEvent.click(await screen.findByText('Use This Person'))
    await waitFor(() => expect(patchVolunteer).toHaveBeenCalled())
    expect(createPerson).not.toHaveBeenCalled()
    expect(putVolunteer).not.toHaveBeenCalled()
    expect(patchVolunteer.mock.calls[0][0]).toBe('9')
    expect(emitted()['volunteer-done'][0][0]).toEqual({ personId: '9', fullName: 'Brown, Nicole K.' })
  })

  it('omits demographics from the create without person:read_demographics', async () => {
    mockHasPermission.mockImplementation(key => key !== 'person:read_demographics')
    mount()
    await screen.findByDisplayValue('Brown')
    await fireEvent.click(screen.getByText('Create Person & Grant Volunteer Role'))
    await waitFor(() => expect(createPerson).toHaveBeenCalled())
    const body = createPerson.mock.calls[0][0]
    for (const k of ['genderId', 'ethnicityId', 'isVeteran', 'races']) expect(k in body).toBe(false)
  })
})
