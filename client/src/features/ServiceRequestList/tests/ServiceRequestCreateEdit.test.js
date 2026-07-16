// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/vue'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import PrimeVue from 'primevue/config'
import ServiceRequestCreateEdit from '../components/ServiceRequestCreateEdit.vue'

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn(), afterEach: () => () => {} }),
  useRoute: () => ({ params: {} })
}))
vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: vi.fn() }) }))
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

beforeEach(() => {
  // jsdom has no matchMedia; PrimeVue Select uses it on mount.
  window.matchMedia = () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {}
  })
})

afterEach(() => vi.clearAllMocks())

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

describe('ServiceRequestCreateEdit start section', () => {
  it('renders a Start section header when location fields are shown', async () => {
    const vm = await mountAndExpose()
    // Location sections (Start/Destination) only render once a member is
    // chosen (village + member gate) AND a located service is picked.
    vm.form.villageId = '1'
    vm.form.memberPersonId = '7'
    vm.form.serviceName = 'Ride: Medical'
    await waitFor(() => {
      const starts = screen.getAllByText(/^Start$/i)
      expect(starts.length).toBeGreaterThan(0)
    })
  })

  it('auto-populates Start from member home when a member is selected and Start is empty', async () => {
    const vm = await mountAndExpose()
    const { getPerson } = await import('../../PersonList/api/personApi.js')

    vm.selectedMember = { label: 'Mabel Member', value: '7' }
    await waitFor(() => expect(getPerson).toHaveBeenCalledWith('7'))
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

  it('fill-from-home writes the "Member\'s Home" name label into each leg', async () => {
    const vm = await mountAndExpose()
    // Load the member's home first.
    vm.selectedMember = { label: 'Mabel Member', value: '7' }
    await waitFor(() => expect(vm.selectedMemberHome).not.toBeNull())

    // Auto-populate on select fills the empty Start leg, name included.
    await waitFor(() => expect(vm.form.start).toBe("Member's Home"))

    // Explicit destination fill writes the name so the required field is set.
    vm.applyMemberHomeToDestination()
    expect(vm.form.destination).toBe("Member's Home")
    expect(vm.form.address).toBe('1 Home St')
  })
})
