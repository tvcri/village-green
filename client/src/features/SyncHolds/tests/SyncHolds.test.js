// @vitest-environment jsdom
import { render, cleanup, fireEvent, waitFor, within } from '@testing-library/vue'
import '@testing-library/jest-dom/vitest'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import PrimeVue from 'primevue/config'
import SyncHolds from '../components/SyncHolds.vue'
import { getSyncHolds, dismissSyncHold, resolveSyncHold, closeSyncHold } from '../api/syncHoldApi.js'

const toastAdd = vi.fn()
vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: toastAdd }) }))
const perms = vi.hoisted(() => ({ denied: new Set() }))
vi.mock('../../../shared/composables/useCurrentUser.js', () => ({
  useCurrentUser: () => ({ hasPermission: (p) => !perms.denied.has(p) })
}))
const route = vi.hoisted(() => ({ query: {} }))
const routerReplace = vi.fn()
vi.mock('vue-router', () => ({
  useRoute: () => route,
  useRouter: () => ({ replace: routerReplace, push: vi.fn(), afterEach: () => () => {} }),
  RouterLink: { props: ['to'], template: '<a><slot /></a>' },
}))
vi.mock('../api/syncHoldApi.js', () => ({
  getSyncHolds: vi.fn(), dismissSyncHold: vi.fn(), resolveSyncHold: vi.fn(), closeSyncHold: vi.fn(),
}))
vi.mock('../../PersonList/api/personApi.js', () => ({ getPersons: vi.fn().mockResolvedValue([]) }))

const base = { state: 'open', field: null, detail: null, resolution: null, dismissalKind: null, persons: [], users: [] }
const donorLgl = (name) => ({ name, email: `${name.split(' ')[0].toLowerCase()}@example.org`, address: '1 Elm St, Bristol RI', lastGiftDate: '2026-09-02' })
const HOLDS = [
  { ...base, holdId: '1', lglConstituentId: '88214', personId: null, reason: 'name-only',
    detail: { candidates: ['101', '102'], lgl: donorLgl('Ann Sousa') },
    persons: [{ personId: '101', fullName: 'Sousa, Ann', displayName: 'Ann Sousa', isDonor: false },
      { personId: '102', fullName: 'Sousa, Annemarie', displayName: 'Annemarie Sousa', isDonor: false }] },
  { ...base, holdId: '2', lglConstituentId: '77302', personId: null, reason: 'import-hold', detail: { importReason: 'Not confirmed on the Work list' } },
  { ...base, holdId: '3', lglConstituentId: '500', personId: '103', field: 'nickname', reason: 'never-agreed', detail: { vg: null, lgl: 'Dan' },
    persons: [{ personId: '103', fullName: 'Okafor, Daniel', displayName: 'Daniel Okafor', isDonor: true }] },
  { ...base, holdId: '4', lglConstituentId: '501', personId: '104', field: null, reason: 'addressee', detail: null,
    persons: [{ personId: '104', fullName: 'Brennan, Margaret', displayName: 'Margaret Brennan', isDonor: true }] },
  { ...base, holdId: '5', lglConstituentId: '502', personId: '105', field: 'phones', reason: 'brand-new-reason', detail: null, persons: [] },
]

function setup () {
  return render(SyncHolds, { global: { plugins: [PrimeVue] } })
}

beforeEach(() => {
  perms.denied = new Set()
  route.query = {}
  vi.mocked(getSyncHolds).mockReset().mockResolvedValue(HOLDS)
  for (const f of [dismissSyncHold, resolveSyncHold, closeSyncHold]) vi.mocked(f).mockReset().mockResolvedValue({})
  toastAdd.mockReset()
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addEventListener () {}, removeEventListener () {} }))
})
afterEach(() => cleanup())

const groupEl = (container, key) => container.querySelector(`[data-group="${key}"]`)

describe('SyncHolds', () => {
  it('groups the holds in staff terms, with counts', async () => {
    const { container, findByText } = setup()
    await findByText('LGL donors who may already be in VG')
    expect(within(groupEl(container, 'maybe')).getByText('2')).toBeInTheDocument()
    expect(within(groupEl(container, 'differ')).getByText('Only LGL has a nickname.')).toBeInTheDocument()
    expect(within(groupEl(container, 'finish')).getByRole('button', { name: 'Done in LGL' })).toBeInTheDocument()
    // unknown reason: with the engineer, raw code as text
    expect(within(groupEl(container, 'engineer')).getByText('brand-new-reason')).toBeInTheDocument()
  })

  it('names an unlinked donor from detail.lgl, and falls back to the LGL id', async () => {
    const { findByText, getByText } = setup()
    await findByText('Ann Sousa')
    expect(getByText('LGL donor 77302')).toBeInTheDocument()
    expect(getByText('Held at the November import review: Not confirmed on the Work list.')).toBeInTheDocument()
  })

  it('says when a person a hold names is no longer in VG', async () => {
    const { findByText } = setup()
    expect(await findByText('Person no longer in VG')).toBeInTheDocument()
  })

  it('filters to one person from the query and shows a removable chip', async () => {
    route.query = { personId: '103' }
    const { findByText, queryByText, getByRole } = setup()
    await findByText('Only LGL has a nickname.')
    expect(queryByText('Ann Sousa')).toBeNull()
    await fireEvent.click(getByRole('button', { name: 'Show everyone' }))
    expect(routerReplace).toHaveBeenCalledWith({ query: {} })
  })

  it('marks a hold as seen and reloads', async () => {
    const { container, findByText } = setup()
    await findByText('Only LGL has a nickname.')
    await fireEvent.click(within(groupEl(container, 'differ')).getByRole('button', { name: 'Mark as seen' }))
    await waitFor(() => expect(dismissSyncHold).toHaveBeenCalledWith('3'))
    await waitFor(() => expect(getSyncHolds).toHaveBeenCalledTimes(2))
  })

  it('asks before not adding a donor', async () => {
    const { container, findByText, getByRole } = setup()
    await findByText('Ann Sousa')
    const maybe = groupEl(container, 'maybe')
    await fireEvent.click(within(maybe).getAllByRole('button', { name: 'Don’t add this donor' })[0])
    expect(dismissSyncHold).not.toHaveBeenCalled()
    await fireEvent.click(getByRole('button', { name: 'Don’t add' }))
    await waitFor(() => expect(dismissSyncHold).toHaveBeenCalledWith('1'))
  })

  it('links a donor to a suggested person', async () => {
    const { container, findByText, findByRole } = setup()
    await findByText('Ann Sousa')
    await fireEvent.click(within(groupEl(container, 'maybe')).getAllByRole('button', { name: 'This is…' })[0])
    await fireEvent.click(await findByRole('button', { name: /Sousa, Annemarie/ }))
    await waitFor(() => expect(resolveSyncHold).toHaveBeenCalledWith('1', { kind: 'link', personId: '102' }))
    await waitFor(() => expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({
      detail: 'Saved. The next sync run links Ann Sousa to Annemarie Sousa.' })))
  })

  it('shows the API’s reason when a link is refused', async () => {
    vi.mocked(resolveSyncHold).mockRejectedValue(Object.assign(new Error('HTTP 422'), {
      status: 422, body: { detail: 'Annemarie Sousa is already linked to LGL donor 9' } }))
    const { container, findByText, findByRole } = setup()
    await findByText('Ann Sousa')
    await fireEvent.click(within(groupEl(container, 'maybe')).getAllByRole('button', { name: 'This is…' })[0])
    await fireEvent.click(await findByRole('button', { name: /Sousa, Annemarie/ }))
    expect(await findByText('Annemarie Sousa is already linked to LGL donor 9')).toBeInTheDocument()
  })

  it('closes an LGL-finish hold with Done in LGL', async () => {
    const { container, findByText } = setup()
    await findByText('Ann Sousa')
    await fireEvent.click(within(groupEl(container, 'finish')).getByRole('button', { name: 'Done in LGL' }))
    await waitFor(() => expect(closeSyncHold).toHaveBeenCalledWith('4'))
  })

  it('shows no actions without sync:write', async () => {
    perms.denied = new Set(['sync:write'])
    const { findByText, queryByRole } = setup()
    await findByText('Ann Sousa')
    for (const name of ['Mark as seen', 'Done in LGL', 'This is…', 'New person']) {
      expect(queryByRole('button', { name })).toBeNull()
    }
  })

  it('shows a pending answer as waiting for the sync', async () => {
    vi.mocked(getSyncHolds).mockResolvedValue([{ ...HOLDS[0], resolution: { kind: 'link', personId: '101' } }])
    const { findByText, queryByRole } = setup()
    expect(await findByText('Waiting for the next sync run')).toBeInTheDocument()
    expect(await findByText(/will link to/)).toHaveTextContent('will link to Sousa, Ann')
    expect(queryByRole('button', { name: 'New person' })).toBeNull()
  })
})
