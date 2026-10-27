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
      circlePreferences: [{ circleId: '2', name: "Veteran's Circle" }],
    }
  }),
  getCircles: vi.fn().mockResolvedValue([
    { circleId: '1', name: 'Circle of Pride' }, { circleId: '2', name: "Veteran's Circle" },
  ]),
}))
vi.mock('../api/roleApi.js', () => ({
  putMember: vi.fn().mockResolvedValue({}),
  patchMember: vi.fn().mockResolvedValue({}),
  deleteMember: vi.fn().mockResolvedValue({})
}))
vi.mock('../../MemberList/api/memberApi.js', () => ({
  getVillageMembers: vi.fn().mockResolvedValue([])
}))

vi.mock('../../Admin/api/dropReasonApi.js', () => ({
  getMemberDropReasons: vi.fn().mockResolvedValue([
    { memberDropReasonId: '1', name: 'Moved', retired: true },
    { memberDropReasonId: '2', name: 'Quit', retired: false },
  ]),
}))

import { getMemberDropReasons } from '../../Admin/api/dropReasonApi.js'
import { getPerson } from '../api/personApi.js'
import { putMember, patchMember } from '../api/roleApi.js'

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
  it('shows the read-only note for a deceased person', async () => {
    getPerson.mockResolvedValueOnce({ personId: '5', fullName: 'Smith, Alice', village: { villageId: '1' }, deceased: true, deceasedDate: null })
    render(MemberEdit, { global: globalOpts })
    expect(await screen.findByText(/This person is marked deceased\. Their member and volunteer records can't be changed\./)).toBeInTheDocument()
    expect(screen.queryByText('Grant Member Role')).toBeNull()
    expect(screen.queryByText('Save')).toBeNull()
  })

  // A failed load leaves person null, so the no-home-village notice replaces
  // the form: no Save or Grant button exists to PUT a new role over the stored one.
  it('a failed person load renders no save button, so it can never PUT a role', async () => {
    getPerson.mockRejectedValueOnce(new Error('down'))
    render(MemberEdit, { global: globalOpts })
    await waitFor(() => expect(getPerson).toHaveBeenCalled())
    await new Promise(r => setTimeout(r, 0))
    expect(screen.queryByText('Grant Member Role')).toBeNull()
    expect(screen.queryByText('Save')).toBeNull()
    expect(putMember).not.toHaveBeenCalled()
    expect(patchMember).not.toHaveBeenCalled()
  })

  it('shows service preferences and saves a toggle', async () => {
    const { patchMember } = await import('../api/roleApi.js')
    render(MemberEdit, { global: globalOpts })
    await screen.findByDisplayValue('M100')
    const vet = screen.getByText("Veteran's Circle").closest('label').querySelector('input[type="checkbox"]')
    expect(vet.checked).toBe(true)
    const pride = screen.getByText('Circle of Pride').closest('label').querySelector('input[type="checkbox"]')
    await fireEvent.click(pride)
    await fireEvent.click(screen.getByText('Save'))
    await waitFor(() => expect(patchMember).toHaveBeenCalled())
    expect(patchMember.mock.calls[0][1].circlePreferences).toEqual(['2', '1'])
  })

  it('a failed circle catalog still edits the existing member, never a PUT replace', async () => {
    const { getCircles } = await import('../api/personApi.js')
    const { patchMember, putMember } = await import('../api/roleApi.js')
    getCircles.mockRejectedValueOnce(new Error('down'))
    render(MemberEdit, { global: globalOpts })
    await screen.findByDisplayValue('M100')
    expect(screen.getByText('Save')).toBeInTheDocument()
    const input = screen.getByDisplayValue('M100')
    await fireEvent.update(input, 'M101')
    await fireEvent.click(screen.getByText('Save'))
    await waitFor(() => expect(patchMember).toHaveBeenCalled())
    expect(putMember).not.toHaveBeenCalled()
    expect('circlePreferences' in patchMember.mock.calls[0][1]).toBe(false)
  })

  it('sends no PATCH when nothing, including preferences, changed', async () => {
    const { patchMember } = await import('../api/roleApi.js')
    render(MemberEdit, { global: globalOpts })
    await screen.findByDisplayValue('M100')
    await fireEvent.click(screen.getByText('Save'))
    await waitFor(() => expect(patchMember).not.toHaveBeenCalled())
  })

  it('shows an existing member\'s stored status, not the new-grant default', async () => {
    render(MemberEdit, { global: globalOpts })
    await screen.findByText('Save')
    expect(document.querySelector('#status').textContent).toContain('Active')
  })

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

    // A new grant starts Pending, as the application import does: the welcome
    // email (sent on activation) waits until the status is set Active.
    it('defaults status to Pending', async () => {
      render(MemberEdit, { global: globalOpts })
      await screen.findByText('Grant Member Role')
      expect(document.querySelector('#status').textContent).toContain('Pending')
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

  describe('drop reason', () => {
    const memberWith = (over) => ({
      personId: '5', fullName: 'Smith, Alice', village: { villageId: '1' },
      member: {
        memberNumber: 'M100', memberLevel: 'Primary', status: 'Active', joinDate: '2024-01-01',
        printedNewsletter: false, createdDate: '2023-06-15', ...over,
      },
    })
    const optionNames = () => [...document.getElementById(document.querySelector('#dropReasonId [role=combobox]').getAttribute('aria-controls'))
      .querySelectorAll('.p-select-option')].map(o => o.getAttribute('aria-label'))

    it('empty catalog shows the hint when status is Dropped', async () => {
      getPerson.mockResolvedValueOnce(memberWith({ status: 'Dropped' }))
      getMemberDropReasons.mockResolvedValueOnce([])
      render(MemberEdit, { global: globalOpts })
      await screen.findByText('Save')
      expect(screen.getByText('No drop reasons yet. An administrator adds them under Admin › Drop Reasons.')).toBeTruthy()
    })

    it('retired current reason is offered and an unchanged save sends no reason', async () => {
      getPerson.mockResolvedValueOnce(memberWith({ status: 'Dropped', dropReasonId: '1', dropReasonName: 'Moved' }))
      render(MemberEdit, { global: globalOpts })
      await screen.findByText('Save')
      await fireEvent.click(document.querySelector('#dropReasonId [role=combobox]'))
      expect(optionNames()).toEqual(['Moved (retired)', 'Quit'])
      await fireEvent.update(screen.getByDisplayValue('M100'), 'M101')
      await fireEvent.click(screen.getByText('Save'))
      await waitFor(() => expect(patchMember).toHaveBeenCalled())
      expect(patchMember.mock.calls[0][1]).toEqual({ memberNumber: 'M101' })
    })

    it('legacy dropped member saves without choosing a reason', async () => {
      getPerson.mockResolvedValueOnce(memberWith({ status: 'Dropped' }))
      render(MemberEdit, { global: globalOpts })
      await fireEvent.update(await screen.findByDisplayValue('M100'), 'M101')
      await fireEvent.click(screen.getByText('Save'))
      await waitFor(() => expect(patchMember).toHaveBeenCalled())
      expect('dropReasonId' in patchMember.mock.calls[0][1]).toBe(false)
    })

    it('dropping requires a reason, then sends it with the status', async () => {
      getPerson.mockResolvedValueOnce(memberWith({}))
      render(MemberEdit, { global: globalOpts })
      await screen.findByText('Save')
      await fireEvent.click(document.querySelector('#status'))
      await fireEvent.mouseDown(screen.getByRole('option', { name: 'Dropped' }))
      await fireEvent.click(screen.getByText('Save'))
      expect(await screen.findByText('A drop reason is required')).toBeTruthy()
      expect(patchMember).not.toHaveBeenCalled()
      await fireEvent.click(document.querySelector('#dropReasonId [role=combobox]'))
      await fireEvent.mouseDown(screen.getByRole('option', { name: 'Quit' }))
      await fireEvent.click(screen.getByText('Save'))
      await waitFor(() => expect(patchMember).toHaveBeenCalled())
      expect(patchMember.mock.calls[0][1]).toMatchObject({ status: 'Dropped', dropReasonId: '2' })
    })
  })

})
