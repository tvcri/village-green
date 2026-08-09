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

  // A legacy member row predating the required-joinDate rule. The new-grant
  // default must not leak onto this path: it would render as stored data while
  // patchPayload() diffed it away, so the NULL silently survived a save.
  describe('editing a member whose stored joinDate is NULL', () => {
    beforeEach(async () => {
      const { getPerson } = await import('../api/personApi.js')
      getPerson.mockResolvedValue({
        personId: '5', fullName: 'Smith, Alice', village: { villageId: '1' },
        member: {
          memberNumber: 'M100', memberLevel: 'Primary', status: 'Active',
          joinDate: null, printedNewsletter: false, createdDate: '2023-06-15',
        }
      })
    })

    it('shows the join date empty rather than defaulting to today', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date(2026, 7, 9, 20, 30, 0))
      try {
        render(MemberEdit, { global: globalOpts })
        await vi.waitFor(() => expect(screen.getByDisplayValue('M100')).toBeInTheDocument())
        expect(screen.queryByDisplayValue('2026-08-09')).not.toBeInTheDocument()
        expect(document.querySelector('#joinDate')).toHaveValue('')
      }
      finally { vi.useRealTimers() }
    })

    it('blocks the save until a join date is supplied', async () => {
      const { patchMember } = await import('../api/roleApi.js')
      render(MemberEdit, { global: globalOpts })

      const memberNumberInput = await screen.findByDisplayValue('M100')
      await fireEvent.update(memberNumberInput, 'M200')
      await fireEvent.click(screen.getByText('Save'))

      await waitFor(() => expect(screen.getByText('Join date is required')).toBeInTheDocument())
      expect(patchMember).not.toHaveBeenCalled()
    })

    it('persists a join date entered by the user', async () => {
      const { patchMember } = await import('../api/roleApi.js')
      render(MemberEdit, { global: globalOpts })

      await screen.findByDisplayValue('M100')
      await fireEvent.update(document.querySelector('#joinDate'), '2024-03-15')
      await fireEvent.click(screen.getByText('Save'))

      await waitFor(() => expect(patchMember).toHaveBeenCalled())
      const [, body] = patchMember.mock.calls[0]
      expect(body.joinDate).toBe('2024-03-15')
    })
  })

  // A person with no member role yet: the grant path is where a member could
  // previously be created with no level and no join date.
  describe('granting a new member role', () => {
    beforeEach(async () => {
      const { getPerson } = await import('../api/personApi.js')
      getPerson.mockResolvedValue({
        personId: '5', fullName: 'Smith, Alice', village: { villageId: '1' },
      })
    })

    it('defaults joinDate to today', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date(2026, 7, 9, 20, 30, 0))
      try {
        render(MemberEdit, { global: globalOpts })
        await vi.waitFor(() => expect(screen.getByText('Grant Member Role')).toBeInTheDocument())
        expect(screen.getByDisplayValue('2026-08-09')).toBeInTheDocument()
      }
      finally { vi.useRealTimers() }
    })

    it('blocks the grant and shows an error when memberLevel is empty', async () => {
      const { putMember } = await import('../api/roleApi.js')
      render(MemberEdit, { global: globalOpts })

      await screen.findByText('Grant Member Role')
      await fireEvent.click(screen.getByText('Grant Member Role'))

      await waitFor(() => expect(screen.getByText('Member level is required')).toBeInTheDocument())
      expect(putMember).not.toHaveBeenCalled()
    })

    it('blocks the grant when joinDate is cleared', async () => {
      const { putMember } = await import('../api/roleApi.js')
      render(MemberEdit, { global: globalOpts })

      await screen.findByText('Grant Member Role')
      const joinDateInput = document.querySelector('#joinDate')
      await fireEvent.update(joinDateInput, '')

      await fireEvent.click(screen.getByText('Grant Member Role'))

      await waitFor(() => expect(screen.getByText('Join date is required')).toBeInTheDocument())
      expect(putMember).not.toHaveBeenCalled()
    })
  })
})
