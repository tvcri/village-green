// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import PrimeVue from 'primevue/config'

const mockApiCall = vi.fn()
const mockGetUrlForOperation = vi.fn(() => 'http://test.local/api/villages/1')

vi.mock('../../../shared/api/apiClient.js', () => ({
  apiCall: (...args) => mockApiCall(...args),
  getUrlForOperation: (...args) => mockGetUrlForOperation(...args),
  getApiSpec: () => ({
    operationMap: new Map([
      ['getVillages', {
        path: '/villages', method: 'get', params: {},
        summary: 'Return a list of Villages', tags: ['Village'],
      }],
      ['getVillage', {
        path: '/villages/{villageId}', method: 'get',
        params: { villageId: { name: 'villageId', in: 'path', required: true, schema: { type: 'string' } } },
        summary: 'Return a Village', tags: ['Village'],
      }],
      ['getFriends', {
        path: '/friends', method: 'get', params: {},
        summary: 'Return a list of Friends', tags: ['Friend'],
      }],
    ]),
  }),
}))

vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: vi.fn() }) }))

const mockTriggerError = vi.fn()
vi.mock('../../../shared/composables/useGlobalError.js', () => ({
  useGlobalError: () => ({
    error: { value: null },
    triggerError: mockTriggerError,
    clearError: vi.fn(),
  }),
}))

const ApiBrowser = (await import('../components/ApiBrowser.vue')).default

function renderBrowser() {
  return render(ApiBrowser, { global: { plugins: [PrimeVue], directives: { tooltip: {} } } })
}

// This project's vitest config has no globals/auto-cleanup, so each render
// stayed mounted in document.body for the whole file. Tests compensated with
// within(container), but any unscoped getAllByText(...)[0] would silently hit
// an EARLIER test's still-mounted ApiBrowser. Unmount between tests instead.
afterEach(cleanup)

beforeEach(() => {
  vi.clearAllMocks()
  // useCurrentUser reads the VG global; canElevate gates whether
  // x-elevation-required operations are listed at all.
  globalThis.VG = { curUser: { canElevate: true } }
  window.matchMedia = window.matchMedia || (query => ({
    matches: false, media: query, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(),
    addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  }))
  // jsdom 26 leaves window.localStorage undefined under vitest unless a
  // storage quota is configured; ApiBrowser's Splitter uses
  // state-storage="local" to persist pane sizes, so give it a stub.
  window.localStorage = window.localStorage || {
    getItem: vi.fn(() => null), setItem: vi.fn(), removeItem: vi.fn(), clear: vi.fn(),
  }
})

describe('ApiBrowser', () => {
  it('lists GET operations and reveals the try-it panel on row select', async () => {
    renderBrowser()
    expect(screen.getAllByText('getVillages').length).toBeGreaterThan(0)

    await userEvent.click(screen.getAllByText('getVillage')[0])

    expect(await screen.findByText('Fetch')).toBeTruthy()
    expect(screen.getAllByText(/villageId/).length).toBeGreaterThan(0)
  })

  // The try-it panel occupies its own splitter pane, so it must stay MOUNTED
  // before any selection — an empty prompt, not an absent component. If it were
  // v-if'd away the pane would collapse on first paint and the persisted
  // divider position would not apply until the user picked a row.
  it('keeps the try-it pane occupied before any operation is selected', async () => {
    // Scoped to this render's container: earlier tests leave their mounted
    // ApiBrowser (with a selection made) in document.body, so a bare `screen`
    // query would find THEIR Fetch button and fail spuriously.
    const { container } = renderBrowser()
    const scoped = within(container)

    expect(scoped.getByText(/Select an operation to try it out/)).toBeTruthy()

    await userEvent.click(scoped.getAllByText('getVillage')[0])

    expect(await scoped.findByText('Fetch')).toBeTruthy()
    expect(scoped.queryByText(/Select an operation to try it out/)).toBeNull()
  })

  // The copy control's PRIMARY click only. The curl/Python menu entries are
  // deliberately not driven here: PrimeVue teleports the SplitButton menu into
  // an overlay outside the component's container, which is awkward to assert
  // against in jsdom, and both generators are covered directly by
  // curl.test.js / python.test.js.
  it('copies the resolved URL on the copy button primary click', async () => {
    const writeText = vi.fn(() => Promise.resolve())
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText }, configurable: true, writable: true,
    })

    const { container } = renderBrowser()
    const scoped = within(container)

    await userEvent.click(scoped.getAllByText('getVillages')[0])
    await userEvent.click(await scoped.findByText('Copy'))

    expect(writeText).toHaveBeenCalledWith('http://test.local/api/villages/1')
  })

  it('renders a 403 as a normal result rather than throwing', async () => {
    mockApiCall.mockRejectedValue({
      name: 'ApiError', message: 'HTTP 403', status: 403,
      url: '/api/villages/1', body: { error: 'forbidden' },
    })

    renderBrowser()
    await userEvent.click(screen.getAllByText('getVillages')[0])
    await userEvent.click(await screen.findByText('Fetch'))

    // The status chip renders the code; no error is thrown, so it resolves
    // and renders here rather than propagating.
    expect(await screen.findByText('403')).toBeTruthy()
    expect(screen.getAllByText(/forbidden/).length).toBeGreaterThan(0)
    // And it must never reach the global error mechanism that drives
    // GlobalErrorModal.vue — the 403 renders in-panel as a normal result,
    // it does not pop the app-wide error modal.
    expect(mockTriggerError).not.toHaveBeenCalled()
  })

  it('marks the selected row as selected (aria-selected + PrimeVue selected state)', async () => {
    const { container } = renderBrowser()
    const scoped = within(container)

    const row = scoped.getAllByText('getVillages')[0].closest('tr')
    expect(row.getAttribute('aria-selected')).toBe('false')

    await userEvent.click(scoped.getAllByText('getVillages')[0])

    // Bound `selection` (not just internal DataTable click state) is what
    // drives both of these — see OperationTable.vue.
    expect(row.getAttribute('aria-selected')).toBe('true')
    expect(row.getAttribute('data-p-selected')).toBe('true')
  })

  it('does not clear the selection or reset the form when re-clicking the already-selected row', async () => {
    const { container } = renderBrowser()
    const scoped = within(container)

    await userEvent.click(scoped.getAllByText('getVillage')[0])
    const villageIdInput = (await scoped.findAllByLabelText(/villageId/))[0]
    await userEvent.type(villageIdInput, '42')
    expect(villageIdInput.value).toBe('42')

    // Re-click the SAME row (PrimeVue fires row-unselect on this, since
    // `selection` is now bound).
    await userEvent.click(scoped.getAllByText('getVillage')[0])

    // Still selected, and the half-filled form must survive — re-selecting
    // the same operationId must not re-trigger the descriptors watch that
    // reinitializes paramValues.
    expect(await scoped.findByText('Fetch')).toBeTruthy()
    expect(villageIdInput.value).toBe('42')
    const row = scoped.getAllByText('getVillage')[0].closest('tr')
    expect(row.getAttribute('aria-selected')).toBe('true')
  })

  // The response pane is not slaved to the table selection: browsing
  // operations is how the user reads the spec, and the response they just
  // fetched must survive that browsing until the NEXT fetch replaces it.
  it('keeps the last response when the selection changes, and labels whose it is', async () => {
    mockApiCall.mockResolvedValue({
      status: 200, statusText: 'OK',
      headers: { get: name => (name === 'content-type' ? 'application/json' : null) },
      text: () => Promise.resolve('{"marker":"KEEP-ME-4471"}'),
    })

    const { container } = renderBrowser()
    const scoped = within(container)

    await userEvent.click(scoped.getAllByText('getVillages')[0])
    await userEvent.click(await scoped.findByText('Fetch'))
    expect(await scoped.findByText(/KEEP-ME-4471/)).toBeTruthy()

    // Switch to a different operation — the response must persist.
    await userEvent.click(scoped.getAllByText('getFriends')[0])

    expect(scoped.getByText(/KEEP-ME-4471/)).toBeTruthy()
    expect(scoped.queryByText(/Select an operation and fetch it/)).toBeFalsy()
    // ...but it must be attributed to the op that produced it, so it is not
    // misread as getFriends' response.
    expect(scoped.getByText('getVillages', { selector: 'code' })).toBeTruthy()
  })

  it('attributes a response that lands after the user switches operations', async () => {
    let resolveA
    const pendingA = new Promise(resolve => { resolveA = resolve })
    mockApiCall.mockImplementationOnce(() => pendingA)
    mockApiCall.mockImplementationOnce(() => Promise.resolve({
      status: 200, statusText: 'OK',
      headers: { get: name => (name === 'content-type' ? 'application/json' : null) },
      text: () => Promise.resolve('{"op":"B"}'),
    }))

    const { container } = renderBrowser()
    const scoped = within(container)

    // Fetch op A (getVillages) — leave it pending.
    await userEvent.click(scoped.getAllByText('getVillages')[0])
    await userEvent.click(await scoped.findByText('Fetch'))

    // Switch to op B (getFriends, paramless so Fetch stays enabled) before A resolves.
    await userEvent.click(scoped.getAllByText('getFriends')[0])

    // The spinner must not appear to belong to B — B's request was never issued.
    expect(container.querySelector('.p-progressspinner')).toBeFalsy()

    // Now let A resolve, with a status/body that appears nowhere else in this
    // fixture. Flush enough microtask ticks that useAsyncState's `await`
    // chain (res.text() -> metaFromResponse -> state.value = result) actually
    // runs and WRITES result.value with A's meta while B is still selected.
    resolveA({
      status: 418, statusText: "I'm a teapot",
      headers: { get: name => (name === 'content-type' ? 'application/json' : null) },
      text: () => Promise.resolve('{"marker":"A-LATE-MARKER-9182"}'),
    })
    await vi.waitFor(() => expect(mockApiCall).toHaveBeenCalledTimes(1))
    // Give the res.text()/JSON.parse/state.value write chain time to settle.
    for (let i = 0; i < 10; i++) await Promise.resolve()

    // A's response renders — responses are no longer discarded on a
    // selection change — but it is labelled as A's, so it cannot be misread
    // as B's. That label is the whole guarantee here: without it, A's 418
    // would sit under a B selection with nothing marking it.
    expect(await scoped.findByText(/A-LATE-MARKER-9182/)).toBeTruthy()
    expect(scoped.getByText('418')).toBeTruthy()
    expect(scoped.getByText('getVillages', { selector: 'code' })).toBeTruthy()

    // Executing B for real replaces it, and the label goes away since the
    // response now belongs to the selected operation.
    await userEvent.click(await scoped.findByText('Fetch'))
    expect(await scoped.findByText(/"B"/)).toBeTruthy()
    expect(scoped.queryByText(/A-LATE-MARKER-9182/)).toBeFalsy()
    expect(scoped.queryByText('getVillages', { selector: 'code' })).toBeFalsy()
  })
})
