// @vitest-environment jsdom
import { render, screen, cleanup, within } from '@testing-library/vue'
import '@testing-library/jest-dom/vitest'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import PrimeVue from 'primevue/config'
import PersonList from '../components/PersonList.vue'
import { getPersons, getCircles } from '../api/personApi.js'

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn(), afterEach: () => () => {} })
}))
vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: vi.fn() }) }))
vi.mock('../../../shared/api/analyticsApi.js', () => ({
  postAnalyticsEvents: vi.fn().mockResolvedValue(undefined)
}))
vi.mock('../../../shared/composables/useCurrentUser.js', () => ({
  useCurrentUser: () => ({ hasPermission: () => false })
}))
vi.mock('../api/personApi.js', () => ({ getPersons: vi.fn(), getCircles: vi.fn() }))
vi.mock('../../VillageList/api/villageApi.js', () => ({
  getVillages: vi.fn().mockResolvedValue([{ villageId: 1, name: 'Testville' }])
}))

const base = {
  village: { villageId: 1, name: 'Testville' },
  email: null,
  phone: {},
  circles: [],
  deceased: false,
  memberStatus: null,
  volunteerStatus: null,
  volunteerPause: null
}
const row = (over) => ({ ...base, ...over })

function setRows (rows) {
  getPersons.mockResolvedValue(rows)
}

async function renderList () {
  render(PersonList, { global: { plugins: [PrimeVue] } })
  await screen.findByRole('table')
}

describe('PersonList grid', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-01T15:00:00Z'))
    window.matchMedia = () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} })
    window.ResizeObserver = class { observe () {} disconnect () {} }
    getCircles.mockResolvedValue([{ circleId: 1, name: 'Circle of Pride' }])
  })
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('has the expected header cells', async () => {
    setRows([row({ personId: 1, fullName: 'Alpha, Ann' })])
    await renderList()
    const headers = screen.getAllByRole('columnheader').map(h => h.textContent.trim())
    expect(headers).toEqual(['Name', 'Village', 'Roles', 'Circles', 'Phone', 'Cell', 'Email'])
  })

  it('renders a pending member tag', async () => {
    setRows([row({ personId: 1, fullName: 'Alpha, Ann', memberStatus: 'Pending' })])
    await renderList()
    const tag = screen.getByLabelText('Member, pending')
    expect(tag).toHaveClass('role-tag', 'role-tag--member', 'role-tag--pending')
  })

  it('masks a deceased row and shows its tags as dropped', async () => {
    setRows([row({ personId: 1, fullName: 'Alpha, Ann', memberStatus: 'Active', deceased: true })])
    await renderList()
    const tag = screen.getByTitle('Member (deceased)')
    expect(tag).toHaveClass('role-tag--member', 'role-tag--dropped')
    expect(tag.closest('tr')).toHaveClass('deceased')
  })

  it('shows circles in the Circles column with the full name as title', async () => {
    setRows([row({ personId: 1, fullName: 'Alpha, Ann', circles: [{ circleId: 1, name: 'Circle of Pride' }] })])
    await renderList()
    const pill = screen.getByText('Pride')
    expect(pill).toHaveClass('circle-pill')
    expect(pill).toHaveAttribute('title', 'Circle of Pride')
  })

  it('marks an in-effect pause inside the volunteer tag and ignores an expired one', async () => {
    setRows([
      row({
        personId: 1, fullName: 'Alpha, Ann', volunteerStatus: 'Active',
        volunteerPause: { scope: 'until', startDate: null, endDate: '2026-11-10' }
      }),
      row({
        personId: 2, fullName: 'Beta, Bob', volunteerStatus: 'Active',
        volunteerPause: { scope: 'until', startDate: null, endDate: '2026-10-01' }
      })
    ])
    await renderList()
    const rows = screen.getAllByRole('row').slice(1)
    const mark = within(rows[0]).getByTitle('Email paused until Nov 10')
    expect(mark.closest('.role-tag')).toHaveClass('role-tag--volunteer')
    expect(rows[1].querySelector('.pause-mark')).toBeNull()
  })
})
