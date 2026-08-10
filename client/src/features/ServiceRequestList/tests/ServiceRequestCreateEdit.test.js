// @vitest-environment jsdom
import { render, screen, waitFor, cleanup } from '@testing-library/vue'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import PrimeVue from 'primevue/config'
import ServiceRequestCreateEdit from '../components/ServiceRequestCreateEdit.vue'

const routeParams = { value: {} }
// Shared spy (vi.hoisted, same reasoning as toastAdd below) so tests can
// assert on navigation the component triggers, e.g. the Unmatched redirect.
const routerPush = vi.hoisted(() => vi.fn())
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: routerPush, afterEach: () => () => {} }),
  useRoute: () => ({ params: routeParams.value })
}))
// One shared spy across mounts so tests can assert on what the component
// actually told the user (useToast: () => ({ add: vi.fn() }) would hand back a
// fresh, uninspectable fn on every call).
const toastAdd = vi.hoisted(() => vi.fn())
vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: toastAdd }) }))
vi.mock('primevue/useconfirm', () => ({ useConfirm: () => ({ require: vi.fn() }) }))
vi.mock('../../../shared/composables/useRequirePermission.js', () => ({
  useRequirePermission: () => {}
}))
vi.mock('../../PersonList/api/personApi.js', () => ({
  getPerson: vi.fn().mockResolvedValue({
    address: '1 Home St', city: 'Springfield', state: 'VA', zip: '22150', phone: '555-0100'
  })
}))
vi.mock('../api/serviceRequestApi.js', () => ({
  getServiceRequest: vi.fn().mockResolvedValue(null),
  createServiceRequest: vi.fn().mockResolvedValue({ serviceRequestId: 1 }),
  updateServiceRequest: vi.fn().mockResolvedValue({ serviceRequestId: 1 })
}))
vi.mock('../../VillageList/api/villageApi.js', () => ({
  getVillages: vi.fn().mockResolvedValue([{ villageId: '1', name: 'V1' }])
}))
vi.mock('../../MemberList/api/memberApi.js', () => ({
  getVillageMembers: vi.fn().mockResolvedValue([
    { personId: '7', personFullName: 'Mabel Member' }
  ])
}))
vi.mock('../../VolunteerList/api/volunteerApi.js', () => ({
  getVillageVolunteers: vi.fn().mockResolvedValue([]),
  getVolunteers: vi.fn().mockResolvedValue([])
}))
vi.mock('../../../shared/api/apiClient.js', () => ({
  apiCall: vi.fn().mockResolvedValue({ serviceRequestId: 1, requestNumber: 1 }),
  isPrivacyAckError: () => false
}))

beforeEach(() => {
  // jsdom has no matchMedia; PrimeVue Select uses it on mount.
  window.matchMedia = () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {}
  })
})

afterEach(() => {
  // Unmount between tests so screen queries don't see a prior test's DOM
  // (e.g. a Ride render's "Starting Location" leaking into an Errand assertion).
  cleanup()
  vi.clearAllMocks()
  routeParams.value = {}
})

const globalOpts = {
  plugins: [PrimeVue],
  // PrimeVue components reference a `tooltip` directive that isn't registered
  // when we mount the SFC in isolation.
  directives: { tooltip: {}, Tooltip: {} }
}

// Render and capture the component's setup state so tests can assert on and
// drive reactive script-setup bindings (form, selectedMember, helpers).
async function mountAndExpose () {
  let setupState = null
  render(ServiceRequestCreateEdit, {
    global: {
      ...globalOpts,
      mixins: [{
        created () {
          // The SFC under test is the VTU root's only child; grab its setup state.
          if (this.$options.name === 'ServiceRequestCreateEdit') {
            setupState = this.$.setupState
          }
        }
      }]
    }
  })
  await waitFor(() => expect(setupState).not.toBeNull())
  return setupState
}

// Mounts in edit mode with a stored request. `mountAndExpose` always mounts in
// create mode, because edit mode is driven by route.params.id.
async function mountEditAndExpose (request) {
  const { getServiceRequest } = await import('../api/serviceRequestApi.js')
  getServiceRequest.mockResolvedValue(request)
  routeParams.value = { id: String(request.serviceRequestId) }
  const vm = await mountAndExpose()
  await waitFor(() => expect(vm.existingRequest).toBeTruthy())
  return vm
}

describe('ServiceRequestCreateEdit start section', () => {
  it('renders a Starting Location section header when location fields are shown', async () => {
    const vm = await mountAndExpose()
    // Location sections (Starting Location/Destination) only render once a
    // member is chosen (village + member gate) AND a located service is picked.
    vm.form.villageId = '1'
    vm.form.memberPersonId = '7'
    vm.form.serviceName = 'Ride: Medical'
    await waitFor(() => {
      const headers = screen.getAllByText(/^Starting Location$/i)
      expect(headers.length).toBeGreaterThan(0)
    })
  })

  it('hides Starting Location for an Errand but shows Destination', async () => {
    const vm = await mountAndExpose()
    vm.form.villageId = '1'
    vm.form.memberPersonId = '7'
    vm.form.serviceName = 'Errand: Shopping'
    await waitFor(() => {
      expect(screen.getAllByText(/^Destination$/).length).toBeGreaterThan(0)
    })
    expect(screen.queryAllByText(/^Starting Location$/).length).toBe(0)
  })

  it('hides the Destination fill/clear buttons for an Errand', async () => {
    const vm = await mountAndExpose()
    vm.form.villageId = '1'
    vm.form.memberPersonId = '7'
    vm.form.serviceName = 'Errand: Shopping'
    await waitFor(() => {
      expect(screen.getAllByText(/^Destination$/).length).toBeGreaterThan(0)
    })
    // Errands match production: plain address fields, no fill/clear helpers.
    expect(document.querySelectorAll('.use-home-btn').length).toBe(0)
    expect(screen.queryByText(/^Clear fields$/)).toBeNull()
  })

  it('shows a "Use member\'s home" button for a Ride destination', async () => {
    const vm = await mountAndExpose()
    vm.form.villageId = '1'
    vm.form.memberPersonId = '7'
    vm.form.serviceName = 'Ride: Medical Appnt'
    await waitFor(() => {
      // Ride renders both Start and Destination use-home buttons.
      expect(document.querySelectorAll('.use-home-btn').length).toBe(2)
    })
  })

  it('auto-populates Start from member home when a Ride is selected and Start is empty', async () => {
    const vm = await mountAndExpose()
    const { getPerson } = await import('../../PersonList/api/personApi.js')

    vm.form.villageId = '1'
    vm.form.memberPersonId = '7'
    vm.selectedMember = { label: 'Mabel Member', value: '7' }
    await waitFor(() => expect(getPerson).toHaveBeenCalledWith('7'))
    // No Ride yet -> Start stays empty.
    expect(vm.form.startAddress).toBe('')

    vm.form.serviceName = 'Ride: Medical Appnt'
    await waitFor(() => expect(vm.form.startAddress).toBe('1 Home St'))
    expect(vm.form.startCity).toBe('Springfield')
    expect(vm.form.startZip).toBe('22150')
  })

  it('does not clobber a non-empty Start when a member is selected', async () => {
    const vm = await mountAndExpose()
    vm.form.startAddress = '99 Prefilled Ave'
    vm.selectedMember = { label: 'Mabel Member', value: '7' }
    await waitFor(() => expect(vm.selectedMemberHome).not.toBeNull())
    // Let the loadMemberHome().then() microtask settle before asserting.
    await new Promise((r) => setTimeout(r, 0))
    expect(vm.form.startAddress).toBe('99 Prefilled Ave')
  })

  it('clearStart empties the start name and all five address fields', async () => {
    const vm = await mountAndExpose()
    vm.form.start = 'Trader Joes'
    vm.form.startAddress = 'a'
    vm.form.startCity = 'b'
    vm.form.startState = 'VA'
    vm.form.startZip = '00000'
    vm.form.startPhone = '555'
    vm.clearStart()
    expect(vm.form.start).toBe('')
    expect(vm.form.startAddress).toBe('')
    expect(vm.form.startCity).toBe('')
    expect(vm.form.startState).toBe('')
    expect(vm.form.startZip).toBe('')
    expect(vm.form.startPhone).toBe('')
  })

  it('does not populate Start for a non-Ride (Errand) service', async () => {
    const vm = await mountAndExpose()
    vm.selectedMember = { label: 'Mabel Member', value: '7' }
    await waitFor(() => expect(vm.selectedMemberHome).not.toBeNull())
    vm.form.serviceName = 'Errand: Shopping'
    await new Promise((r) => setTimeout(r, 0))
    expect(vm.form.startAddress).toBe('')
    expect(vm.form.start).toBe('')
  })

  it('clears Start when switching from a Ride to a non-Ride', async () => {
    const vm = await mountAndExpose()
    vm.selectedMember = { label: 'Mabel Member', value: '7' }
    await waitFor(() => expect(vm.selectedMemberHome).not.toBeNull())
    vm.form.serviceName = 'Ride: Medical Appnt'
    await waitFor(() => expect(vm.form.startAddress).toBe('1 Home St'))
    vm.form.serviceName = 'Errand: Shopping'
    await waitFor(() => expect(vm.form.startAddress).toBe(''))
    expect(vm.form.start).toBe('')
  })

  it('fill-from-home writes the "Member\'s Home" name label into each leg', async () => {
    const vm = await mountAndExpose()
    // Load the member's home first.
    vm.selectedMember = { label: 'Mabel Member', value: '7' }
    await waitFor(() => expect(vm.selectedMemberHome).not.toBeNull())

    // Start fills only once a Ride is chosen; the name label is included.
    vm.form.serviceName = 'Ride: Medical Appnt'
    await waitFor(() => expect(vm.form.start).toBe("Member's Home"))

    // Explicit destination fill writes the name so the required field is set.
    vm.applyMemberHomeToDestination()
    expect(vm.form.destination).toBe("Member's Home")
    expect(vm.form.address).toBe('1 Home St')
  })

  // Regression: a One Way trip carrying a stale apptTime (left over from Round
  // Trip) must not fail time-ordering validation — Arrive/Return are
  // Round-Trip-only. Bug reported: "Arrival time must be after start time" on a
  // valid One Way (start 2pm, finish 2:45pm).
  it('One Way with a stale early apptTime still passes time-ordering', async () => {
    const vm = await mountAndExpose()
    vm.form.transportationType = 'One Way'
    vm.form.startTime = 840   // 14:00
    vm.form.finishTime = 885  // 14:45
    vm.form.apptTime = 0      // stale 00:00, <= startTime — would falsely fail if not gated
    await waitFor(() => expect(unref(vm.timesInOrder)).toBe(true))
  })

  it('switching Round Trip -> One Way clears Arrive and Return', async () => {
    const vm = await mountAndExpose()
    vm.form.transportationType = 'Round Trip'
    vm.form.apptTime = 600
    vm.form.returnTime = 660
    vm.form.transportationType = 'One Way'
    await waitFor(() => {
      expect(vm.form.apptTime).toBeNull()
      expect(vm.form.returnTime).toBeNull()
    })
  })
})

// The OAS rejects {status: Completed, notify: true} outright, so the primary
// save action must neither promise nor send a notification once the resolved
// status is Completed.
describe('the primary save action never notifies when the status is Completed', () => {
  const baseRequest = {
    serviceRequestId: 1, requestNumber: 1, villageId: '1', memberPersonId: '7',
    serviceName: 'Errand: Shopping', serviceDate: '2026-08-01',
    status: 'Member cancelled', volunteerPersonId: null
  }

  // Attaching a volunteer no longer completes a cancelled request as of this
  // task (#27233) — the status droplist (Task 2) is the only way to reach
  // Completed from a cancelled request, so the derivation this block used to
  // exercise that way is gone. The guarantee itself (never notify once the
  // resolved status is Completed) is still asserted below via a request that
  // arrives at Completed by already being Completed.
  it('relabels an already-Completed request, which notified and 400d before', async () => {
    await mountEditAndExpose({ ...baseRequest, status: 'Completed', volunteerPersonId: '9' })

    await waitFor(() => expect(screen.getByText('Save')).toBeTruthy())
    expect(screen.queryByText('Save and Notify')).toBeNull()
  })

  it('submits notify:false for an already-Completed request', async () => {
    const { apiCall } = await import('../../../shared/api/apiClient.js')
    apiCall.mockResolvedValue({ serviceRequestId: 1, requestNumber: 1 })
    const vm = await mountEditAndExpose({ ...baseRequest, status: 'Completed', volunteerPersonId: '9' })

    await vm.handleSubmit(unref(vm.notifyOnPrimarySave))
    await waitFor(() => expect(apiCall).toHaveBeenCalled())
    const [operationId, , payload] = apiCall.mock.calls.at(-1)
    expect(operationId).toBe('patchServiceRequest')
    expect(payload.status).toBe('Completed')
    expect(payload.notify).toBe(false)
  })

  // Saving an edit to an already-cancelled request announces nothing: the
  // cancelled event belongs to the act of cancelling, which doCancelRequest
  // sends. Offering "Save and Notify" here promised a message that describes
  // no event.
  it.each(['Member cancelled', 'Volunteer cancelled', 'Hub cancelled'])(
    'offers a plain Save on an already-%s request',
    async (status) => {
      await mountEditAndExpose({ ...baseRequest, status })

      await waitFor(() => expect(screen.getByText('Save')).toBeTruthy())
      expect(screen.queryByText('Save and Notify')).toBeNull()
      expect(screen.queryByText('Save only')).toBeNull()
    }
  )

  it('submits notify:false when saving an edit to a cancelled request', async () => {
    const { apiCall } = await import('../../../shared/api/apiClient.js')
    apiCall.mockResolvedValue({ serviceRequestId: 1, requestNumber: 1 })
    const vm = await mountEditAndExpose(baseRequest)

    await vm.handleSubmit(unref(vm.notifyOnPrimarySave))
    await waitFor(() => expect(apiCall).toHaveBeenCalled())
    const [, , payload] = apiCall.mock.calls.at(-1)
    expect(payload.status).toBe('Member cancelled')
    expect(payload.notify).toBe(false)
  })

  it('still offers Save and Notify on an Open request', async () => {
    await mountEditAndExpose({ ...baseRequest, status: 'Open' })

    await waitFor(() => expect(screen.getByText('Save and Notify')).toBeTruthy())
  })
})

describe('Completed requests require a volunteer', () => {
  const completedRequest = {
    serviceRequestId: 1, requestNumber: 1, villageId: '1', memberPersonId: '7',
    serviceName: 'Errand: Shopping', serviceDate: '2026-08-01',
    status: 'Completed', volunteerPersonId: '9'
  }

  it('does not submit a Completed request whose volunteer was cleared', async () => {
    const { apiCall } = await import('../../../shared/api/apiClient.js')
    const vm = await mountEditAndExpose(completedRequest)

    vm.form.volunteerPersonId = null
    await vm.handleSubmit(false)

    // isSubmitting is reset to false in a finally block regardless of whether
    // the guard fired, so it can't distinguish "returned early" from "the
    // mocked PATCH resolved" on its own. apiCall not being reached is the
    // signal that actually proves the guard fired.
    expect(vm.isSubmitting).toBe(false)
    expect(apiCall).not.toHaveBeenCalled()
  })

  it('submits normally when the volunteer is present', async () => {
    const { apiCall } = await import('../../../shared/api/apiClient.js')
    const vm = await mountEditAndExpose(completedRequest)

    await vm.handleSubmit(false)
    // apiCall being reached is what proves the guard did not fire —
    // computedStatus is the same either way.
    expect(apiCall).toHaveBeenCalled()
    expect(unref(vm.computedStatus)).toBe('Completed')
  })
})

describe('status droplist', () => {
  const cancelledRequest = {
    serviceRequestId: 1, requestNumber: 1, villageId: '1', memberPersonId: '7',
    serviceName: 'Errand: Shopping', serviceDate: '2026-08-01',
    status: 'Member cancelled', volunteerPersonId: null
  }

  it('offers the other cancel reasons plus Completed on a cancelled request', async () => {
    const vm = await mountEditAndExpose(cancelledRequest)
    expect(unref(vm.isTerminal)).toBe(true)
    expect(unref(vm.statusOptions)).toEqual([
      'Member cancelled', 'Volunteer cancelled', 'Hub cancelled', 'Completed'
    ])
  })

  it('does not render the droplist on a non-terminal request', async () => {
    const vm = await mountEditAndExpose({ ...cancelledRequest, status: 'Open' })
    expect(unref(vm.isTerminal)).toBe(false)
  })

  it('previews the pending selection in the header Tag before saving', async () => {
    const vm = await mountEditAndExpose(cancelledRequest)
    expect(unref(vm.computedStatus)).toBe('Member cancelled')

    vm.form.status = 'Hub cancelled'
    await waitFor(() => expect(unref(vm.computedStatus)).toBe('Hub cancelled'))
    // Nothing was saved — the preview is local until Save.
    const { apiCall } = await import('../../../shared/api/apiClient.js')
    expect(apiCall).not.toHaveBeenCalled()
  })

  it('sends the selected status on save', async () => {
    const { apiCall } = await import('../../../shared/api/apiClient.js')
    const vm = await mountEditAndExpose(cancelledRequest)

    vm.form.status = 'Hub cancelled'
    await vm.handleSubmit(false)

    const [, , payload] = apiCall.mock.calls.at(-1)
    expect(payload.status).toBe('Hub cancelled')
  })
})

describe('volunteer requirement when completing', () => {
  const cancelledRequest = {
    serviceRequestId: 1, requestNumber: 1, villageId: '1', memberPersonId: '7',
    serviceName: 'Errand: Shopping', serviceDate: '2026-08-01',
    status: 'Member cancelled', volunteerPersonId: null
  }

  it('marks the volunteer field required once Completed is selected', async () => {
    const vm = await mountEditAndExpose(cancelledRequest)
    expect(screen.queryByTestId('volunteer-required')).toBeNull()

    vm.form.status = 'Completed'
    await waitFor(() => {
      expect(screen.getByTestId('volunteer-required')).toBeTruthy()
    })
  })

  it('drops the marker when a non-completing status is selected', async () => {
    const vm = await mountEditAndExpose(cancelledRequest)

    vm.form.status = 'Completed'
    await waitFor(() => expect(screen.getByTestId('volunteer-required')).toBeTruthy())

    vm.form.status = 'Hub cancelled'
    await waitFor(() => expect(screen.queryByTestId('volunteer-required')).toBeNull())
  })
})

describe('a rejected save explains itself', () => {
  // The API's lifecycle rules throw SmError.UnprocessableError(detail), which
  // errorHandlers.js serializes as { error, code, detail } and apiClient parses
  // onto ApiError.body. Without surfacing body.detail the user sees only
  // "Failed to update service request" — e.g. on an Unmatched row, where
  // changing the volunteer is a 422 by policy. The client no longer offers a
  // pencil for those rows, but the API rule stands on its own and the client
  // must still surface the reason whenever a save is rejected.
  const unmatchedRequest = {
    serviceRequestId: 1, requestNumber: 1, villageId: '1', memberPersonId: '7',
    serviceName: 'Errand: Shopping', serviceDate: '2026-08-01',
    status: 'Unmatched', volunteerPersonId: null
  }

  function apiError (body) {
    const err = new Error('HTTP 422')
    err.name = 'ApiError'
    err.status = 422
    err.body = body
    return err
  }

  it("shows the server's explanation instead of the generic failure", async () => {
    const { apiCall } = await import('../../../shared/api/apiClient.js')
    const vm = await mountEditAndExpose(unmatchedRequest)
    apiCall.mockRejectedValueOnce(apiError({
      error: 'Unprocessable Entity.',
      detail: 'Cannot change the volunteer on a request with status Unmatched.'
    }))
    toastAdd.mockClear()

    vm.form.volunteerPersonId = '9'
    await vm.handleSubmit(false)

    const errorToast = toastAdd.mock.calls.map(c => c[0]).find(t => t.severity === 'error')
    expect(errorToast?.detail).toBe('Cannot change the volunteer on a request with status Unmatched.')
  })

  it('falls back to the generic message when the error carries no detail string', async () => {
    const { apiCall } = await import('../../../shared/api/apiClient.js')
    const vm = await mountEditAndExpose(unmatchedRequest)
    // A structured detail object (some endpoints send one) carries no sentence.
    apiCall.mockRejectedValueOnce(apiError({ error: 'Unprocessable Entity.', detail: { reason: 'nope' } }))
    toastAdd.mockClear()

    await vm.handleSubmit(false)

    const errorToast = toastAdd.mock.calls.map(c => c[0]).find(t => t.severity === 'error')
    expect(errorToast?.detail).toBe('Failed to update service request')
  })
})

describe('editing an Unmatched request is disallowed', () => {
  // The rules for editing an Unmatched request are unsettled, so the edit
  // route refuses to present the form for one even when reached directly
  // (bookmark, back button, hand-typed URL) — the list already hides the
  // pencil, but the route itself must independently refuse to render.
  const unmatchedRequest = {
    serviceRequestId: 5, requestNumber: 5, villageId: '1', memberPersonId: '7',
    serviceName: 'Errand: Shopping', serviceDate: '2026-08-01',
    status: 'Unmatched', volunteerPersonId: null
  }

  it('redirects to the detail view instead of rendering an editable form', async () => {
    await mountEditAndExpose(unmatchedRequest)

    await waitFor(() => expect(routerPush).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'service-request-detail',
        params: { villageId: '1', id: '5' }
      })
    ))
    // No editable form should ever appear for an Unmatched request.
    expect(screen.queryByRole('form')).toBeNull()
    expect(document.querySelector('form')).toBeNull()
  })

  it('warns the user why they were redirected', async () => {
    await mountEditAndExpose(unmatchedRequest)

    await waitFor(() => expect(toastAdd).toHaveBeenCalled())
    const warnToast = toastAdd.mock.calls.map(c => c[0]).find(t => t.severity === 'warn')
    expect(warnToast?.detail).toMatch(/cannot be edited/i)
  })

  it('still renders an editable form for a non-Unmatched request', async () => {
    const vm = await mountEditAndExpose({ ...unmatchedRequest, status: 'Open' })

    await waitFor(() => expect(document.querySelector('form')).not.toBeNull())
    expect(routerPush).not.toHaveBeenCalled()
    expect(vm.form.villageId).toBe('1')
  })
})

describe('#27233 — a cancelled request that already has a volunteer', () => {
  // The request was Confirmed with a volunteer, then cancelled. The volunteer
  // is still recorded on it. Before the droplist, computedStatus tested
  // volunteer *presence*, so this previewed Completed on load and any save
  // silently completed the request.
  const cancelledWithVolunteer = {
    serviceRequestId: 27233, requestNumber: 27233, villageId: '1',
    memberPersonId: '7', serviceName: 'Errand: Shopping',
    serviceDate: '2026-08-01', status: 'Member cancelled',
    volunteerPersonId: '9', description: 'original note'
  }

  it('loads showing its cancelled status, not Completed', async () => {
    const vm = await mountEditAndExpose(cancelledWithVolunteer)
    expect(unref(vm.computedStatus)).toBe('Member cancelled')
    expect(screen.queryByTestId('volunteer-required')).toBeNull()
  })

  it('saves an unrelated edit without changing status', async () => {
    const { apiCall } = await import('../../../shared/api/apiClient.js')
    const vm = await mountEditAndExpose(cancelledWithVolunteer)

    vm.form.description = 'edited note'
    await vm.handleSubmit(false)

    const [, , payload] = apiCall.mock.calls.at(-1)
    expect(payload.description).toBe('edited note')
    expect(payload.status).toBe('Member cancelled')
  })
})

// Vue unwraps top-level refs on the setupState proxy in most cases, but a
// computed may surface as a ref — read through this to be safe.
function unref (v) {
  return v && typeof v === 'object' && 'value' in v ? v.value : v
}
