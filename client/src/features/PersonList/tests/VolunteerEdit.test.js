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
vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: vi.fn() }) }))
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
      associateVillages: [],
      vettings: []
    }
  }),
  getCapabilities: vi.fn().mockResolvedValue([
    { capabilityId: 1, name: 'Driving' },
    { capabilityId: 2, name: 'Errands' }
  ]),
  getVettingTypes: vi.fn().mockResolvedValue([])
}))
vi.mock('../api/roleApi.js', () => ({
  putVolunteer: vi.fn().mockResolvedValue({}),
  patchVolunteer: vi.fn().mockResolvedValue({}),
  deleteVolunteer: vi.fn().mockResolvedValue({})
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
})
