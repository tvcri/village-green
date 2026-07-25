// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/vue'
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

beforeEach(() => {
  vi.clearAllMocks()
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

    expect(await screen.findByText('Execute')).toBeTruthy()
    expect(screen.getAllByText(/villageId/).length).toBeGreaterThan(0)
  })

  it('renders a 403 as a normal result rather than throwing', async () => {
    mockApiCall.mockRejectedValue({
      name: 'ApiError', message: 'HTTP 403', status: 403,
      url: '/api/villages/1', body: { error: 'forbidden' },
    })

    renderBrowser()
    await userEvent.click(screen.getAllByText('getVillages')[0])
    await userEvent.click(await screen.findByText('Execute'))

    // The status chip renders the code; no error is thrown, so it resolves
    // and renders here rather than propagating.
    expect(await screen.findByText('403')).toBeTruthy()
    expect(screen.getAllByText(/forbidden/).length).toBeGreaterThan(0)
    // And it must never reach the global error mechanism that drives
    // GlobalErrorModal.vue — the 403 renders in-panel as a normal result,
    // it does not pop the app-wide error modal.
    expect(mockTriggerError).not.toHaveBeenCalled()
  })
})
