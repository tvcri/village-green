// @vitest-environment jsdom
import { render, screen, cleanup, within, fireEvent, waitFor } from '@testing-library/vue'
import '@testing-library/jest-dom/vitest'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import PrimeVue from 'primevue/config'
import PersonList from '../components/PersonList.vue'
import { getPersons, getCircles } from '../api/personApi.js'
import { downloadCsv } from '../../../shared/lib/csvUtils.js'

const routerPush = vi.hoisted(() => vi.fn())
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: routerPush, afterEach: () => () => {} })
}))
vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: vi.fn() }) }))
vi.mock('../../../shared/api/analyticsApi.js', () => ({
  postAnalyticsEvents: vi.fn().mockResolvedValue(undefined)
}))
const perms = vi.hoisted(() => ({ denied: new Set(), all: true }))
vi.mock('../../../shared/composables/useCurrentUser.js', () => ({
  useCurrentUser: () => ({ hasPermission: (p) => !perms.all ? false : !perms.denied.has(p) })
}))
vi.mock('../api/personApi.js', () => ({ getPersons: vi.fn(), getCircles: vi.fn() }))
vi.mock('../../VillageList/api/villageApi.js', () => ({
  getVillages: vi.fn().mockResolvedValue([{ villageId: 1, name: 'Testville' }])
}))

vi.mock('../../../shared/lib/csvUtils.js', async (importOriginal) => ({
  ...(await importOriginal()),
  downloadCsv: vi.fn()
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
    perms.all = false
    perms.denied = new Set()
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
    expect(tag).toHaveTextContent(/^member$/)
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
    const pill = within(screen.getByRole('table')).getByText('Pride')
    expect(pill).toHaveClass('circle-pill')
    expect(pill).toHaveAttribute('title', 'Circle of Pride')
  })

  it('copies the email from its button without opening the row', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    setRows([row({ personId: 1, fullName: 'Alpha, Ann', email: 'ann@example.com' })])
    await renderList()
    const button = screen.getByRole('button', { name: 'Copy email ann@example.com' })
    const rowClick = vi.fn()
    button.closest('tr').addEventListener('click', rowClick)
    await fireEvent.click(button)
    expect(writeText).toHaveBeenCalledWith('ann@example.com')
    expect(rowClick).not.toHaveBeenCalled()
    expect(await screen.findByRole('button', { name: 'Copied' })).toHaveClass('copied')
    expect(routerPush).not.toHaveBeenCalled()

    // The rest of the row still opens the person.
    await fireEvent.click(screen.getByText('ann@example.com'))
    expect(routerPush).toHaveBeenCalledTimes(1)
  })

  it('shows no copy button when there is no email', async () => {
    setRows([row({ personId: 1, fullName: 'Alpha, Ann' })])
    await renderList()
    expect(screen.queryByRole('button', { name: /^Copy email/ })).toBeNull()
  })

  it('marks an in-effect pause inside the volunteer tag and ignores an expired one', async () => {
    setRows([
      row({
        personId: 1, fullName: 'Alpha, Ann', volunteerStatus: 'Active',
        volunteerPause: { scope: 'all', startDate: null, endDate: '2026-11-10' }
      }),
      row({
        personId: 2, fullName: 'Beta, Bob', volunteerStatus: 'Active',
        volunteerPause: { scope: 'all', startDate: null, endDate: '2026-10-01' }
      })
    ])
    await renderList()
    const rows = screen.getAllByRole('row').slice(1)
    const mark = within(rows[0]).getByTitle('Email paused until Nov 10')
    expect(mark.closest('.role-tag')).toHaveClass('role-tag--volunteer')
    expect(rows[1].querySelector('.pause-mark')).toBeNull()
  })

  it('drops the pause mark once the pause ends, on the next rebuild of the rows', async () => {
    setRows([
      row({
        personId: 1, fullName: 'Alpha, Ann', volunteerStatus: 'Active',
        volunteerPause: { scope: 'all', startDate: null, endDate: '2026-11-01' }
      }),
      row({ personId: 2, fullName: 'Beta, Bob', volunteerStatus: 'Active' })
    ])
    await renderList()
    expect(screen.getByTitle('Email paused until Nov 1')).toBeInTheDocument()
    vi.setSystemTime(new Date('2026-11-02T15:00:00Z'))
    await fireEvent.update(screen.getByPlaceholderText('Name'), 'a')
    await waitFor(() => expect(screen.queryByTitle(/Email paused/)).toBeNull())
  })

  describe('Filters panel', () => {
    const people = () => [
      row({ personId: 1, fullName: 'Alpha, Ann', memberStatus: 'Pending' }),
      row({ personId: 2, fullName: 'Beta, Bob', memberStatus: 'Active' }),
      row({ personId: 3, fullName: 'Gamma, Gus', memberStatus: 'Active', circles: [{ circleId: 1, name: 'Circle of Pride' }] })
    ]
    const bodyRows = () => screen.getAllByRole('row').slice(1)

    beforeEach(() => { perms.all = true })

    it('opens with every control visible and collapses from the Filters button', async () => {
      setRows(people())
      await renderList()
      const btn = screen.getByRole('button', { name: /Filters/ })
      expect(btn).toHaveAttribute('aria-expanded', 'true')
      expect(screen.getByRole('combobox')).toBeInTheDocument()
      for (const ph of ['Name', 'Phone', 'Email']) expect(screen.getByPlaceholderText(ph)).toBeVisible()
      for (const g of ['Member', 'Volunteer', 'Circles', 'Match', 'Also']) {
        expect(screen.getByRole('group', { name: g })).toBeInTheDocument()
      }
      await fireEvent.click(btn)
      expect(btn).toHaveAttribute('aria-expanded', 'false')
      expect(screen.queryByPlaceholderText('Name')).toBeNull()
    })

    it('once the open panel scrolls away, the button reads collapsed and a click brings it back', async () => {
      setRows(people())
      await renderList()
      const btn = screen.getByRole('button', { name: /Filters/ })
      const content = document.querySelector('.filters-content')
      const header = document.querySelector('.filters-header')
      // Scrolled: the panel's bottom has passed under the sticky header row.
      content.getBoundingClientRect = () => ({ bottom: 20 })
      header.getBoundingClientRect = () => ({ bottom: 80 })
      const frame = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => { cb(); return 0 })
      const scrollTo = vi.fn()
      window.scrollTo = scrollTo
      window.dispatchEvent(new Event('scroll'))
      await waitFor(() => expect(btn).toHaveAttribute('aria-expanded', 'false'))

      await fireEvent.click(btn)
      expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' })
      expect(screen.getByPlaceholderText('Name')).toBeInTheDocument()

      // Back in view: the button reads open, and a click collapses as before.
      content.getBoundingClientRect = () => ({ bottom: 400 })
      window.dispatchEvent(new Event('scroll'))
      await waitFor(() => expect(btn).toHaveAttribute('aria-expanded', 'true'))
      await fireEvent.click(btn)
      expect(screen.queryByPlaceholderText('Name')).toBeNull()
      frame.mockRestore()
    })

    it('a picked tag filters rows, badges the button and writes the sentence', async () => {
      setRows(people())
      await renderList()
      const tag = within(screen.getByRole('group', { name: 'Member' })).getByRole('button', { name: /pending/i })
      expect(tag).toHaveAttribute('aria-pressed', 'false')
      await fireEvent.click(tag)
      expect(tag).toHaveAttribute('aria-pressed', 'true')
      expect(bodyRows()).toHaveLength(1)
      expect(screen.getByRole('button', { name: /Filters/ })).toHaveTextContent('1')
      expect(screen.getByText('People who are a pending member')).toBeInTheDocument()
    })

    it('Match offers Any, All and Exactly these; Exactly these drops the circle member', async () => {
      setRows(people())
      await renderList()
      const match = screen.getByRole('group', { name: 'Match' })
      expect(within(match).getAllByRole('button').map(b => b.textContent.trim()))
        .toEqual(['Any', 'All', 'Exactly these'])
      await fireEvent.click(within(screen.getByRole('group', { name: 'Member' })).getByRole('button', { name: /active/i }))
      expect(bodyRows()).toHaveLength(2)
      await fireEvent.click(within(match).getByRole('button', { name: 'Exactly these' }))
      expect(bodyRows()).toHaveLength(1)
      expect(bodyRows()[0]).toHaveTextContent('Beta, Bob')
    })

    it('counts N of M and the inline clear appears only with a filter', async () => {
      setRows(people())
      await renderList()
      expect(screen.getByText(/3 of 3 persons/)).toBeInTheDocument()
      expect(screen.queryByTitle('Clear all filters')).toBeNull()
      await fireEvent.click(within(screen.getByRole('group', { name: 'Member' })).getByRole('button', { name: /pending/i }))
      expect(screen.getByText(/1 of 3 persons/)).toBeInTheDocument()
      await fireEvent.click(screen.getByTitle('Clear all filters'))
      expect(bodyRows()).toHaveLength(3)
      expect(screen.queryByTitle('Clear all filters')).toBeNull()
      expect(screen.getByRole('button', { name: /Filters/ })).not.toHaveTextContent('1')
    })

    it('without read_inactive the Member group offers only active; no demographics, no Veteran', async () => {
      perms.denied = new Set(['member:read_inactive', 'person:read_demographics'])
      setRows(people())
      await renderList()
      const member = screen.getByRole('group', { name: 'Member' })
      expect(within(member).getAllByRole('button')).toHaveLength(1)
      expect(within(member).getByRole('button', { name: /active/i })).toBeInTheDocument()
      expect(screen.queryByLabelText('Veteran')).toBeNull()
      expect(screen.getByLabelText('Email paused')).toBeInTheDocument()
    })

    it('no matches shows the sentence in the empty state; old role checkboxes are gone', async () => {
      setRows(people())
      await renderList()
      expect(screen.queryByRole('checkbox', { name: 'Member' })).toBeNull()
      expect(screen.queryByRole('checkbox', { name: 'Volunteer' })).toBeNull()
      await fireEvent.click(within(screen.getByRole('group', { name: 'Volunteer' })).getByRole('button', { name: /active/i }))
      const empty = await screen.findByText(/No persons match/)
      expect(empty).toHaveTextContent('People who are an active volunteer')
    })
  })

  describe('CSV export', () => {
    // fullName is "Last, First", so cells are quoted; split on commas outside quotes.
    const cellsOf = (line) => line.match(/("([^"]|"")*"|[^,]*)(,|$)/g).slice(0, -1).map(c => c.replace(/,$/, ''))
    beforeEach(() => { perms.all = true })

    it('exports member/volunteer status from the on-screen rows, filtered, in place of Roles', async () => {
      const summary = [
        row({ personId: 1, fullName: 'Alpha, Ann', memberStatus: 'Pending', volunteerStatus: null }),
        row({ personId: 2, fullName: 'Beta, Bob', memberStatus: 'Active', volunteerStatus: 'Dropped' }),
        row({ personId: 3, fullName: 'Gamma, Gus', memberStatus: 'Active', deceased: true })
      ]
      // The export fetch carries different (gated) statuses; they must be ignored.
      const detail = summary.map(p => ({ ...p, memberStatus: null, volunteerStatus: null, detail: {} }))
      getPersons.mockImplementation(async (params) => params?.projection?.includes('detail') ? detail : summary)
      await renderList()
      await fireEvent.click(within(screen.getByRole('group', { name: 'Member' })).getByRole('button', { name: /pending/i }))
      await fireEvent.click(screen.getByRole('button', { name: /Export|Download/ }))
      await fireEvent.click(await screen.findByText('Download'))
      await waitFor(() => expect(downloadCsv).toHaveBeenCalled())
      const [csv] = downloadCsv.mock.calls[0]
      const [head, ...lines] = csv.split('\n')
      const headers = head.split(',')
      expect(headers).toContain('Member Status')
      expect(headers).toContain('Volunteer Status')
      expect(headers).not.toContain('Roles')
      expect(lines).toHaveLength(1)
      const cells = cellsOf(lines[0])
      expect(cells[headers.indexOf('Member Status')]).toBe('Pending')
      expect(cells[headers.indexOf('Volunteer Status')]).toBe('')
    })

    it('a deceased Active member exports Active', async () => {
      const summary = [row({ personId: 3, fullName: 'Gamma, Gus', memberStatus: 'Active', deceased: true })]
      getPersons.mockImplementation(async (params) =>
        params?.projection?.includes('detail') ? summary.map(p => ({ ...p, detail: {} })) : summary)
      await renderList()
      await fireEvent.click(screen.getByRole('button', { name: /Export|Download/ }))
      await fireEvent.click(await screen.findByText('Download'))
      await waitFor(() => expect(downloadCsv).toHaveBeenCalled())
      const [head, line] = downloadCsv.mock.calls[0][0].split('\n')
      expect(cellsOf(line)[head.split(',').indexOf('Member Status')]).toBe('Active')
    })
  })
})
