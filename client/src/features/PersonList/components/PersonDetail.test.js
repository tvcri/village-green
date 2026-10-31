// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup } from '@testing-library/vue'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import PrimeVue from 'primevue/config'
import Tooltip from 'primevue/tooltip'
import PersonDetail from './PersonDetail.vue'
import { apiCall } from '../../../shared/api/apiClient.js'

const push = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
  useRoute: () => ({ params: { personId: '5' } })
}))
vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: vi.fn() }) }))
vi.mock('primevue/useconfirm', () => ({ useConfirm: () => ({ require: vi.fn() }) }))
vi.mock('../../../shared/api/apiClient.js', () => ({ apiCall: vi.fn() }))
vi.mock('../../../components/PersonMap.vue', () => ({ default: { template: '<div />' } }))

let granted = []
vi.mock('../../../shared/composables/useCurrentUser.js', () => ({
  useCurrentUser: () => ({ hasPermission: p => granted.includes(p) })
}))

const ALL = ['person:write', 'member:write', 'volunteer:write']
const person = (over = {}) => ({
  personId: '5', fullName: 'Currie, Robert, Jr.', lastName: 'Currie', firstName: 'Robert', suffix: 'Jr.',
  activeAs: ['member', 'volunteer'], deceased: false,
  member: { status: 'Active' },
  volunteer: { volunteerStatus: 'Active', capabilities: ['Driving'], pause: null },
  ...over
})

beforeEach(() => {
  window.matchMedia = () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} })
  const store = new Map()
  vi.stubGlobal('localStorage', { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) })
  push.mockClear()
})
afterEach(() => cleanup())

async function mount (p = person()) {
  apiCall.mockResolvedValue(p)
  render(PersonDetail, { global: { plugins: [PrimeVue], directives: { tooltip: Tooltip } } })
  await screen.findByText('Personal Information')
}

describe('PersonDetail — section header edit shortcuts', () => {
  it('shows each pencil only under its permission', async () => {
    granted = ['member:write']
    await mount()
    expect(screen.queryByTestId('edit-person-shortcut')).toBeNull()
    expect(screen.getByTestId('edit-member-shortcut')).toBeInTheDocument()
    expect(screen.queryByTestId('edit-volunteer-shortcut')).toBeNull()
    cleanup()
    granted = ['person:write', 'volunteer:write']
    await mount()
    expect(screen.getByTestId('edit-person-shortcut')).toBeInTheDocument()
    expect(screen.queryByTestId('edit-member-shortcut')).toBeNull()
    expect(screen.getByTestId('edit-volunteer-shortcut')).toBeInTheDocument()
  })

  it('puts each pencil in its own section header', async () => {
    granted = ALL
    await mount()
    const header = text => screen.getByText(text).parentElement
    expect(header('Personal Information')).toContainElement(screen.getByTestId('edit-person-shortcut'))
    expect(header('Member Information')).toContainElement(screen.getByTestId('edit-member-shortcut'))
    expect(header('Volunteer Information')).toContainElement(screen.getByTestId('edit-volunteer-shortcut'))
  })

  it('hides the member and volunteer pencils for a deceased person', async () => {
    granted = ALL
    await mount(person({ deceased: true }))
    expect(screen.getByTestId('edit-person-shortcut')).toBeInTheDocument()
    expect(screen.queryByTestId('edit-member-shortcut')).toBeNull()
    expect(screen.queryByTestId('edit-volunteer-shortcut')).toBeNull()
  })

  it('routes each pencil to its editor', async () => {
    granted = ALL
    await mount()
    for (const [id, name] of [['edit-person-shortcut', 'meta-person-edit'], ['edit-member-shortcut', 'meta-person-member'], ['edit-volunteer-shortcut', 'meta-person-volunteer']]) {
      push.mockClear()
      await fireEvent.click(screen.getByTestId(id))
      expect(push).toHaveBeenCalledWith({ name, params: { personId: '5' } })
    }
  })
})
