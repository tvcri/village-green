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

describe('PersonDetail — delete guard', () => {
  const deleteButton = () => screen.getByRole('button', { name: 'Delete' })

  it('allows the delete only with no role rows', async () => {
    granted = ALL
    await mount(person({ activeAs: [], member: null, volunteer: null }))
    expect(deleteButton()).toBeEnabled()
  })

  it('blocks a role that is not active, which activeAs omits', async () => {
    granted = ALL
    await mount(person({ activeAs: [], member: { status: 'Dropped' }, volunteer: null }))
    expect(deleteButton()).toBeDisabled()
    cleanup()
    await mount(person({ activeAs: [], member: null, volunteer: { volunteerStatus: 'Pending', capabilities: [], pause: null } }))
    expect(deleteButton()).toBeDisabled()
  })

  it('blocks a deceased person with roles and says to untick Deceased', async () => {
    granted = ALL
    await mount(person({ activeAs: [], deceased: true }))
    expect(deleteButton()).toBeDisabled()
    await fireEvent.mouseEnter(deleteButton().parentElement)
    expect(await screen.findByText(/^Untick Deceased/)).toBeInTheDocument()
  })
})

describe('PersonDetail — donor tag and section', () => {
  const projectionOf = () => apiCall.mock.calls.at(-1)[1].projection
  const DONOR = { donorId: '3', personId: '5', lglConstituentId: 'L9', lastGiftDate: '2024-03-02' }

  beforeEach(() => apiCall.mockReset())

  it('asks for the donor projection and shows tag, last gift and the LGL link', async () => {
    granted = [...ALL, 'donor:read']
    await mount(person({ donor: DONOR }))
    expect(projectionOf()).toContain('donor')
    expect(screen.getByText('Donor', { selector: '.donor-tag, .donor-tag *' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Donor' })).toBeInTheDocument()
    expect(screen.getByText('Mar 2, 2024')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: 'Open in LGL' })
    expect(link).toHaveAttribute('href', expect.stringMatching(/\/constituents\/L9$/))
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener')
  })

  it('shows a dash when the donor has no gift date', async () => {
    granted = [...ALL, 'donor:read']
    await mount(person({ donor: { ...DONOR, lastGiftDate: null } }))
    expect(screen.getByText('Last gift').nextElementSibling).toHaveTextContent('—')
  })

  it('without donor:read the projection is exactly member, volunteer and no Donor text', async () => {
    granted = ALL
    await mount(person({ donor: DONOR }))
    expect(projectionOf()).toEqual(['member', 'volunteer'])
    expect(screen.queryByText(/Donor/)).toBeNull()
    expect(screen.queryByRole('link', { name: 'Open in LGL' })).toBeNull()
  })

  it('shows neither tag nor section for a person who is not a donor', async () => {
    granted = [...ALL, 'donor:read']
    await mount(person({ donor: null }))
    expect(projectionOf()).toContain('donor')
    expect(screen.queryByText(/Donor/)).toBeNull()
  })
})
