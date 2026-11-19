// @vitest-environment jsdom
import { render, cleanup, waitFor, screen } from '@testing-library/vue'
import '@testing-library/jest-dom/vitest'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import PrimeVue from 'primevue/config'
import Tooltip from 'primevue/tooltip'
import PersonDetail from '../components/PersonDetail.vue'
import { apiCall } from '../../../shared/api/apiClient.js'
import { deletePerson } from '../api/personApi.js'
import { getSyncHolds } from '../../SyncHolds/api/syncHoldApi.js'

const toastAdd = vi.fn()
vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: toastAdd }) }))
const confirmed = vi.hoisted(() => ({ last: null }))
vi.mock('primevue/useconfirm', () => ({ useConfirm: () => ({ require: (opts) => { confirmed.last = opts } }) }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { personId: '5' } }),
  useRouter: () => ({ push: vi.fn(), afterEach: () => () => {} }),
}))
const perms = vi.hoisted(() => ({ denied: new Set() }))
vi.mock('../../../shared/composables/useCurrentUser.js', () => ({
  useCurrentUser: () => ({ hasPermission: (p) => !perms.denied.has(p) })
}))
vi.mock('../../../shared/api/apiClient.js', () => ({ apiCall: vi.fn() }))
vi.mock('../api/personApi.js', () => ({ deletePerson: vi.fn() }))
vi.mock('../api/roleApi.js', () => ({ deleteVolunteerPause: vi.fn() }))
vi.mock('../../SyncHolds/api/syncHoldApi.js', () => ({ getSyncHolds: vi.fn() }))
vi.mock('../../../shared/lib/crumbPerson.js', () => ({ setCrumbPerson: vi.fn() }))
// The card is tested on its own; here only what PersonDetail hands it matters.
const cardProps = vi.hoisted(() => ({ last: null }))
vi.mock('../../../shared/components/PersonDetailCard.vue', () => ({
  default: { props: ['person', 'personType', 'hasMemberDetail', 'hasVolunteerDetail', 'donor', 'syncHoldCount'],
    setup (props) { cardProps.last = props; return {} }, template: '<div />' }
}))

const donorPerson = { personId: '5', fullName: 'Okafor, Daniel', activeAs: [], donor: { lglConstituentId: '77', lastGiftDate: null } }

function setup () {
  return render(PersonDetail, { global: { plugins: [PrimeVue], directives: { tooltip: Tooltip }, stubs: { VolunteerPauseDialog: true } } })
}

beforeEach(() => {
  perms.denied = new Set()
  cardProps.last = null
  confirmed.last = null
  toastAdd.mockReset()
  vi.mocked(apiCall).mockReset().mockResolvedValue(donorPerson)
  vi.mocked(getSyncHolds).mockReset().mockResolvedValue([{ holdId: '1' }, { holdId: '2' }])
  vi.mocked(deletePerson).mockReset()
  window.matchMedia = () => ({ matches: false, addEventListener () {}, removeEventListener () {} })
})
afterEach(() => cleanup())

describe('PersonDetail — LGL sync hint', () => {
  it('counts the donor’s open holds for the card', async () => {
    setup()
    await waitFor(() => expect(cardProps.last?.syncHoldCount).toBe(2))
    // a count needs no names, so no projection
    expect(getSyncHolds).toHaveBeenCalledWith({ state: ['open'], personId: '5', projection: [] })
  })

  it('does not ask without sync:read', async () => {
    perms.denied = new Set(['sync:read'])
    setup()
    await waitFor(() => expect(cardProps.last?.donor).toBeTruthy())
    expect(getSyncHolds).not.toHaveBeenCalled()
    expect(cardProps.last.syncHoldCount ?? 0).toBe(0)
  })
})

describe('PersonDetail — Delete on a donor', () => {
  it('is disabled for a donor', async () => {
    setup()
    await waitFor(() => expect(cardProps.last?.donor).toBeTruthy())
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled()
  })

  it('shows the API’s reason when the delete is refused', async () => {
    vi.mocked(apiCall).mockResolvedValue({ ...donorPerson, donor: null })
    vi.mocked(deletePerson).mockRejectedValue(Object.assign(new Error('HTTP 422'), {
      status: 422, body: { detail: 'This person is still named on other records, such as service requests, and cannot be deleted.' } }))
    setup()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled())
    screen.getByRole('button', { name: 'Delete' }).click()
    await confirmed.last.accept()
    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({
      severity: 'error', detail: 'This person is still named on other records, such as service requests, and cannot be deleted.' }))
  })
})
