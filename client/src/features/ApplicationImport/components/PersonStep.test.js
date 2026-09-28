// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/vue'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import PrimeVue from 'primevue/config'
import PersonStep from './PersonStep.vue'
import { _resetPersonLookups } from '../../PersonList/composables/usePersonLookups.js'

vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: vi.fn() }) }))
const mockHasPermission = vi.fn(() => true)
vi.mock('../../../shared/composables/useCurrentUser.js', () => ({
  useCurrentUser: () => ({ hasPermission: mockHasPermission }),
}))
vi.mock('../../PersonList/api/personApi.js', () => ({
  getPersons: vi.fn().mockResolvedValue([]),
  createPerson: vi.fn(),
  getDisabilities: vi.fn().mockResolvedValue([]),
  getCircles: vi.fn().mockResolvedValue([{ circleId: '1', name: 'Circle of Pride' }, { circleId: '2', name: "Veteran's Circle" }]),
  geocodeTown: vi.fn().mockResolvedValue({ town: null }),
  getGenders: vi.fn().mockResolvedValue([{ genderId: '1', name: 'Female' }, { genderId: '2', name: 'Male' }]),
  getEthnicities: vi.fn().mockResolvedValue([]),
  getRaces: vi.fn().mockResolvedValue([]),
  getContactMethods: vi.fn().mockResolvedValue([]),
  getLanguages: vi.fn().mockResolvedValue([]),
}))
vi.mock('../../VillageList/api/villageApi.js', () => ({
  getVillages: vi.fn().mockResolvedValue([{ villageId: '1', name: 'Westside' }]),
}))

import { getPersons, createPerson } from '../../PersonList/api/personApi.js'

const extraction = (over = {}) => ({
  applicationType: 'member', schemaVersion: 1, extractedAt: '2026-09-25T00:00:00.000Z',
  application: { applicationDate: '2026-06-12', village: { villageId: '1', villageName: 'Westside' }, ambassador: '', householdType: 'Single' },
  members: [{
    firstName: 'Robert', lastName: 'Currie',
    extras: { pronouns: 'he/him', gender: 'Male', veteran: 'Yes', accessibility: null, accessibilityNotes: null },
  }],
  emergencyContact: null,
  preferences: { wantsVolunteerInfo: 'No', circleOfPrideJoin: 'No', circlePreferred: null, circleOfPridePreferred: 'No' },
  memberDefaults: { printedNewsletter: false, duesMonthly: null, duesYearly: null, paymentMethod: null, invoiceMailed: null },
  uncertainFields: [],
  ...over,
})

function mount (ext = extraction()) {
  return render(PersonStep, {
    props: { extraction: ext, memberIndex: 0 },
    global: { plugins: [PrimeVue], directives: { tooltip: {} } },
  })
}

beforeEach(() => {
  window.matchMedia = () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} })
  _resetPersonLookups()
  mockHasPermission.mockReturnValue(true)
  createPerson.mockResolvedValue({ personId: '42', fullName: 'Currie, Robert, Jr.' })
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

async function submit () {
  await screen.findByDisplayValue('Currie')
  await waitFor(() => expect(screen.getByText('Male')).toBeInTheDocument())   // gender matched after the catalog loads
  await fireEvent.click(screen.getByText('Create Person & Continue'))
  await waitFor(() => expect(createPerson).toHaveBeenCalled())
  return createPerson.mock.calls[0][0]
}

describe('PersonStep', () => {
  it('creates the person with the prefilled pronouns, matched gender and veteran answer', async () => {
    mount()
    const body = await submit()
    expect(body).toMatchObject({ firstName: 'Robert', lastName: 'Currie', pronouns: 'he/him', genderId: '2', isVeteran: true })
  })

  it('emits person-done with the stored fullName, suffix included', async () => {
    const { emitted } = mount()
    await submit()
    await waitFor(() => expect(emitted()['person-done']).toBeTruthy())
    expect(emitted()['person-done'][0][0]).toEqual({ personId: '42', fullName: 'Currie, Robert, Jr.', existing: false })
  })

  it('omits demographics from the create without person:read_demographics', async () => {
    mockHasPermission.mockImplementation(key => key !== 'person:read_demographics')
    mount()
    await screen.findByDisplayValue('Currie')
    await fireEvent.click(screen.getByText('Create Person & Continue'))
    await waitFor(() => expect(createPerson).toHaveBeenCalled())
    const body = createPerson.mock.calls[0][0]
    for (const k of ['genderId', 'ethnicityId', 'isVeteran', 'races']) expect(k in body).toBe(false)
    expect(body.pronouns).toBe('he/him')
  })

  it('a Yes to joining the Circle of Pride pre-ticks it and saves it', async () => {
    mount(extraction({ preferences: { wantsVolunteerInfo: 'No', circleOfPrideJoin: 'Yes', circlePreferred: null, circleOfPridePreferred: 'No' } }))
    const body = await submit()
    expect(body.circles).toEqual(['1'])
  })

  it('using an existing match skips creation and emits that person', async () => {
    getPersons.mockResolvedValue([{ personId: '7', fullName: 'Currie, Robert', village: { name: 'Westside' } }])
    const { emitted } = mount()
    await fireEvent.click(await screen.findByText('Use This Person'))
    expect(createPerson).not.toHaveBeenCalled()
    expect(emitted()['person-done'][0][0]).toEqual({ personId: '7', fullName: 'Currie, Robert', existing: true })
  })
})
