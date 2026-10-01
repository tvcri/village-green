// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/vue'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import PrimeVue from 'primevue/config'
import MemberStep from './MemberStep.vue'

vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: vi.fn() }) }))
vi.mock('../../PersonList/api/personApi.js', () => ({
  getPerson: vi.fn(),
  patchPerson: vi.fn(),
  getCircles: vi.fn(),
}))
vi.mock('../../PersonList/api/roleApi.js', () => ({
  putMember: vi.fn().mockResolvedValue({}),
  patchMember: vi.fn().mockResolvedValue({}),
}))
vi.mock('../../VillageList/api/villageApi.js', () => ({ getVillages: vi.fn().mockResolvedValue([]) }))
vi.mock('../../MemberList/api/memberApi.js', () => ({ getVillageMembers: vi.fn().mockResolvedValue([]) }))

import { getPerson, getCircles } from '../../PersonList/api/personApi.js'
import { putMember, patchMember } from '../../PersonList/api/roleApi.js'

const extraction = () => ({
  applicationType: 'member', schemaVersion: 1, extractedAt: '2026-09-25T00:00:00.000Z',
  application: { applicationDate: '2026-06-12', village: { villageId: '1', villageName: 'Westside' }, ambassador: '', householdType: 'Single' },
  members: [{ firstName: 'Marge', lastName: 'Innovera', extras: { pronouns: null, gender: null, veteran: null, accessibility: null, accessibilityNotes: null } }],
  emergencyContact: null,
  preferences: { wantsVolunteerInfo: 'No', circleOfPrideJoin: 'No', circlePreferred: null, circleOfPridePreferred: 'No' },
  memberDefaults: { printedNewsletter: false, duesMonthly: null, duesYearly: null, paymentMethod: null, invoiceMailed: null },
  uncertainFields: [],
})

beforeEach(() => {
  window.matchMedia = () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} })
  getPerson.mockResolvedValue({
    personId: '5',
    member: {
      memberNumber: 'M100', memberLevel: 'Primary', status: 'Active', joinDate: '2024-01-01',
      circlePreferences: [{ circleId: '2', name: "Veteran's Circle" }],
    },
  })
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('MemberStep — existing member', () => {
  it('a failed circle catalog never wipes stored preferences', async () => {
    getCircles.mockRejectedValue(new Error('down'))
    render(MemberStep, {
      props: { extraction: extraction(), memberIndex: 0, personId: '5' },
      global: { plugins: [PrimeVue], directives: { tooltip: {} } },
    })
    await screen.findByText(/already has a member role/)
    await fireEvent.click(screen.getByText('Update Member & Continue'))
    await waitFor(() => expect(patchMember).toHaveBeenCalled())
    expect('circlePreferences' in patchMember.mock.calls[0][1]).toBe(false)
  })

  it('sends preferences unchanged-when-untouched as nothing, changed as the new set', async () => {
    getCircles.mockResolvedValue([{ circleId: '1', name: 'Circle of Pride' }, { circleId: '2', name: "Veteran's Circle" }])
    render(MemberStep, {
      props: { extraction: extraction(), memberIndex: 0, personId: '5' },
      global: { plugins: [PrimeVue], directives: { tooltip: {} } },
    })
    await screen.findByText('Circle of Pride')
    const pride = screen.getByText('Circle of Pride').closest('label').querySelector('input[type="checkbox"]')
    await fireEvent.click(pride)
    await fireEvent.click(screen.getByText('Update Member & Continue'))
    await waitFor(() => expect(patchMember).toHaveBeenCalled())
    expect(patchMember.mock.calls[0][1].circlePreferences).toEqual(['2', '1'])
  })
})

// Imported applications start Pending (agreed with the membership coordinator,
// 2026-09-29): the member is recorded from receipt, and the welcome email,
// which fires on activation, waits until someone sets the status to Active.
describe('MemberStep — status default', () => {
  it('a new member defaults to Pending', async () => {
    getPerson.mockResolvedValue({ personId: '5', member: null })
    getCircles.mockResolvedValue([])
    render(MemberStep, {
      props: { extraction: extraction(), memberIndex: 0, personId: '5' },
      global: { plugins: [PrimeVue], directives: { tooltip: {} } },
    })
    await fireEvent.click(await screen.findByText('Grant Member Role & Continue'))
    await waitFor(() => expect(putMember).toHaveBeenCalled())
    expect(putMember.mock.calls[0][1].status).toBe('Pending')
  })

  it('an existing member keeps its stored status', async () => {
    getCircles.mockResolvedValue([])
    render(MemberStep, {
      props: { extraction: extraction(), memberIndex: 0, personId: '5' },
      global: { plugins: [PrimeVue], directives: { tooltip: {} } },
    })
    await fireEvent.click(await screen.findByText('Update Member & Continue'))
    await waitFor(() => expect(patchMember).toHaveBeenCalled())
    expect(patchMember.mock.calls[0][1].status).toBe('Active')
  })
})
