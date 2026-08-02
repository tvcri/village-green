// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/vue'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import PrimeVue from 'primevue/config'
import MemberEdit from '../components/MemberEdit.vue'

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
    member: {
      memberNumber: 'M100',
      memberLevel: 'Primary',
      status: 'Active',
      joinDate: '2024-01-01',
      householdSize: 2,
      householdDues: 100,
      printedNewsletter: false,
      createdDate: '2023-06-15',
    }
  })
}))
vi.mock('../api/roleApi.js', () => ({
  putMember: vi.fn().mockResolvedValue({}),
  patchMember: vi.fn().mockResolvedValue({}),
  deleteMember: vi.fn().mockResolvedValue({})
}))
vi.mock('../../MemberList/api/memberApi.js', () => ({
  getVillageMembers: vi.fn().mockResolvedValue([])
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

describe('MemberEdit', () => {
  it('loads and displays the existing member values', async () => {
    render(MemberEdit, { global: globalOpts })
    await waitFor(() => expect(screen.getByDisplayValue('M100')).toBeInTheDocument())
    expect(screen.getByDisplayValue('2024-01-01')).toBeInTheDocument()
    expect(screen.getByDisplayValue('2023-06-15')).toBeInTheDocument()
  })

  it('saves edits to member number and household size in the patch payload', async () => {
    const { patchMember } = await import('../api/roleApi.js')
    render(MemberEdit, { global: globalOpts })

    const memberNumberInput = await screen.findByDisplayValue('M100')
    await fireEvent.update(memberNumberInput, 'M200')

    const householdSizeInput = screen.getByDisplayValue('2')
    await fireEvent.update(householdSizeInput, '4')
    await fireEvent.blur(householdSizeInput)

    await fireEvent.click(screen.getByText('Save'))

    await waitFor(() => expect(patchMember).toHaveBeenCalled())
    const [personId, body] = patchMember.mock.calls[0]
    expect(personId).toBe('5')
    expect(body.memberNumber).toBe('M200')
    expect(body.householdSize).toBe(4)
  })

  it('saves a toggled printedNewsletter checkbox', async () => {
    const { patchMember } = await import('../api/roleApi.js')
    render(MemberEdit, { global: globalOpts })

    await screen.findByDisplayValue('M100')
    const checkbox = document.querySelector('.checkbox-item input[type="checkbox"]')
    await fireEvent.click(checkbox)

    await fireEvent.click(screen.getByText('Save'))

    await waitFor(() => expect(patchMember).toHaveBeenCalled())
    const [, body] = patchMember.mock.calls[0]
    expect(body.printedNewsletter).toBe(true)
  })
})
