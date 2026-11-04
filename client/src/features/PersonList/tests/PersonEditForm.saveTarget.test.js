// @vitest-environment jsdom
// A save waits on the municipality lookup. On 2026-10-29 that wait ran to
// 32 seconds and users moved on during it: the save then read the person
// from the page they had reached, overwrote someone else's record from one
// page and created stray people from another. These tests drive a real router
// so that navigation behaves as it does in the app.
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/vue'
import { h } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory, RouterView } from 'vue-router'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import PrimeVue from 'primevue/config'
import PersonEditForm from '../components/PersonEditForm.vue'
import { _resetPersonLookups } from '../composables/usePersonLookups.js'

vi.mock('primevue/useconfirm', () => ({ useConfirm: () => ({ require: vi.fn() }) }))
const mockToastAdd = vi.fn()
vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: mockToastAdd }) }))
vi.mock('../../../shared/composables/useRequirePermission.js', () => ({
  useRequirePermission: () => {}
}))
vi.mock('../../../shared/composables/useCurrentUser.js', () => ({
  useCurrentUser: () => ({ hasPermission: () => true }),
}))
vi.mock('../api/personApi.js', () => ({
  getPerson: vi.fn(),
  createPerson: vi.fn().mockResolvedValue({ personId: '9' }),
  patchPerson: vi.fn().mockResolvedValue({}),
  getCircles: vi.fn().mockResolvedValue([]),
  getDisabilities: vi.fn().mockResolvedValue([]),
  getGenders: vi.fn().mockResolvedValue([]),
  getEthnicities: vi.fn().mockResolvedValue([]),
  getRaces: vi.fn().mockResolvedValue([]),
  getContactMethods: vi.fn().mockResolvedValue([]),
  getLanguages: vi.fn().mockResolvedValue([]),
}))
vi.mock('../../VillageList/api/villageApi.js', () => ({
  getVillages: vi.fn().mockResolvedValue([{ villageId: '1', name: 'Testville' }])
}))

// Stands in for PersonFormFields: its lookup stays pending until the test
// releases it, like a Census request that has not come back. Every caller
// shares the one lookup, as they do in the real component.
let releaseLookup
let lookup
const FieldsStub = {
  setup: (_, { expose }) => {
    expose({ townSettled: () => lookup })
    return () => h('div')
  },
}

const person = (personId, firstName) => ({
  personId, firstName, lastName: 'Tester', displayName: `${firstName} Tester`,
  village: { villageId: '1', name: 'Testville' }, circles: [], disabilities: [],
})

const Elsewhere = { render: () => h('div', 'Person list') }

async function renderAt (path) {
  const { getPerson } = await import('../api/personApi.js')
  getPerson.mockImplementation(async (id) => person(id, id === '5' ? 'Alice' : 'Betty'))
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/meta/persons', name: 'meta-persons', component: Elsewhere },
      { path: '/meta/persons/create', name: 'meta-person-create', component: PersonEditForm },
      { path: '/meta/persons/:personId/edit', name: 'meta-person-edit', component: PersonEditForm },
      { path: '/meta/persons/:personId', name: 'meta-person-detail', component: Elsewhere },
    ],
  })
  await router.push(path)
  await router.isReady()
  render({ render: () => h(RouterView) }, {
    global: {
      plugins: [PrimeVue, router],
      directives: { tooltip: {}, Tooltip: {} },
      stubs: { PersonFormFields: FieldsStub },
    },
  })
  await waitFor(() => expect(screen.getByText('Save').closest('button')).toBeEnabled())
  return router
}

async function clickSave () {
  await fireEvent.click(screen.getByText('Save'))
  await flushPromises()
}

beforeEach(() => {
  window.matchMedia = () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} })
  _resetPersonLookups()
  lookup = new Promise(resolve => { releaseLookup = resolve })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('a save waiting on the municipality lookup', () => {
  it('keeps the user on the form when they try to leave', async () => {
    const router = await renderAt('/meta/persons/5/edit')
    await clickSave()
    await router.push('/meta/persons')
    expect(router.currentRoute.value.name).toBe('meta-person-edit')
    expect(mockToastAdd).toHaveBeenCalledWith(expect.objectContaining({ detail: expect.stringMatching(/saving/i) }))
  })

  it('never creates a person from an edit form', async () => {
    const { patchPerson, createPerson } = await import('../api/personApi.js')
    const router = await renderAt('/meta/persons/5/edit')
    await clickSave()
    await router.push('/meta/persons')
    releaseLookup()
    await flushPromises()
    expect(createPerson).not.toHaveBeenCalled()
    expect(patchPerson).toHaveBeenCalledTimes(1)
    expect(patchPerson.mock.calls[0][0]).toBe('5')
  })

  it('saves to the person it was clicked for when the route moves to another person', async () => {
    const { patchPerson } = await import('../api/personApi.js')
    const router = await renderAt('/meta/persons/5/edit')
    await clickSave()
    // The same component serves both edit pages, so this reaches the form
    // without unmounting it. Nothing in the app links here, but history can.
    await router.push('/meta/persons/6/edit')
    releaseLookup()
    await flushPromises()
    expect(patchPerson).toHaveBeenCalledTimes(1)
    expect(patchPerson.mock.calls[0][0]).toBe('5')
    await waitFor(() => expect(router.currentRoute.value.fullPath).toBe('/meta/persons/5'))
  })

  it('sends one save when Save is clicked again', async () => {
    const { patchPerson } = await import('../api/personApi.js')
    await renderAt('/meta/persons/5/edit')
    await clickSave()
    await clickSave()
    releaseLookup()
    await flushPromises()
    expect(patchPerson).toHaveBeenCalledTimes(1)
  })

  it('shows Save as busy and disables Cancel until it finishes', async () => {
    await renderAt('/meta/persons/5/edit')
    await clickSave()
    expect(screen.getByText('Save').closest('button')).toBeDisabled()
    expect(screen.getByText('Cancel').closest('button')).toBeDisabled()
    releaseLookup()
    await flushPromises()
  })

  it('lets the user leave after a failed save', async () => {
    const { patchPerson } = await import('../api/personApi.js')
    patchPerson.mockRejectedValueOnce(new Error('boom'))
    const router = await renderAt('/meta/persons/5/edit')
    await clickSave()
    releaseLookup()
    await flushPromises()
    expect(mockToastAdd).toHaveBeenCalledWith(expect.objectContaining({ detail: 'Failed to save person' }))
    await router.push('/meta/persons')
    expect(router.currentRoute.value.name).toBe('meta-persons')
  })
})
