// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup } from '@testing-library/vue'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import PrimeVue from 'primevue/config'
import DropReasonsAdmin from '../components/DropReasonsAdmin.vue'

vi.mock('primevue/useconfirm', () => ({ useConfirm: () => ({ require: vi.fn() }) }))
vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: vi.fn() }) }))
vi.mock('../../../shared/composables/useRequirePermission.js', () => ({ useRequirePermission: () => {} }))
vi.mock('../../Trainings/api/trainingApi.js', () => ({
  getTrainings: vi.fn(), createTraining: vi.fn(), patchTraining: vi.fn(), deleteTraining: vi.fn(),
}))
vi.mock('../../Positions/api/positionApi.js', () => ({
  getPositions: vi.fn(), createPosition: vi.fn(), patchPosition: vi.fn(), deletePosition: vi.fn(),
}))
vi.mock('../api/dropReasonApi.js', () => ({
  getMemberDropReasons: vi.fn(), createMemberDropReason: vi.fn(), patchMemberDropReason: vi.fn(), deleteMemberDropReason: vi.fn(),
  getVolunteerDropReasons: vi.fn(), createVolunteerDropReason: vi.fn(), patchVolunteerDropReason: vi.fn(), deleteVolunteerDropReason: vi.fn(),
}))
import { getMemberDropReasons, getVolunteerDropReasons } from '../api/dropReasonApi.js'

beforeEach(() => {
  window.matchMedia = () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} })
  window.ResizeObserver = class { observe () {} unobserve () {} disconnect () {} }
  getMemberDropReasons.mockResolvedValue([{ memberDropReasonId: '1', name: 'Moved away', description: null, retired: false, holderCount: 3 }])
  getVolunteerDropReasons.mockResolvedValue([{ volunteerDropReasonId: '1', name: 'Too busy', description: null, retired: false, holderCount: 2 }])
})
afterEach(() => { cleanup(); vi.clearAllMocks() })

const opts = { global: { plugins: [PrimeVue], directives: { tooltip: {} } } }

describe('DropReasonsAdmin', () => {
  it('has Member and Volunteer tabs, Member first, each with its own catalog', async () => {
    render(DropReasonsAdmin, opts)
    expect(screen.getAllByRole('tab').map(t => t.textContent.trim())).toEqual(['Member', 'Volunteer'])
    expect(await screen.findByText('Moved away')).toBeInTheDocument()
    expect(getVolunteerDropReasons).not.toHaveBeenCalled()
    await fireEvent.click(screen.getByRole('tab', { name: 'Volunteer' }))
    expect(await screen.findByText('Too busy')).toBeInTheDocument()
    expect(screen.getByText('Volunteers')).toBeInTheDocument()
  })
})
