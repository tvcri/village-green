// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api, isPrivacyAckError } from '../api/apiClient.js'
import { usePrivacyAck } from '../composables/usePrivacyAck.js'

// Mock global fetch
const fetchMock = vi.fn()
globalThis.fetch = fetchMock

describe('apiClient privacy-ack 403 interceptor', () => {
  beforeEach(() => {
    fetchMock.mockClear()
    vi.clearAllMocks()
    // apiFetch calls reloadIfExpired() first; a token with no exp reads as
    // expired and would reload the page instead of fetching. Give it a live one.
    globalThis.VG = {
      Env: { apiBase: 'http://localhost/api' },
      oidcWorker: { token: null, tokenParsed: { exp: Math.floor(Date.now() / 1000) + 3600 } },
    }
  })

  it('flips the gate on 403 privacy_ack_required and throws a recognizable PrivacyAckError', async () => {
    const { needsAck, clearAck } = usePrivacyAck()
    clearAck() // ensure starting state
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: async () => JSON.stringify({ error: 'privacy_ack_required' }),
    })
    // The interceptor opens the ack modal via the gate and throws a distinct
    // PrivacyAckError (rather than returning null) so callers never dereference a
    // poisoned result; useAsyncState / callers suppress it via isPrivacyAckError().
    const err = await api.get('/villages').catch(e => e)
    expect(isPrivacyAckError(err)).toBe(true)
    expect(err.status).toBe(403)
    expect(needsAck.value).toBe(true)
  })

  it('does not flip the gate on an ordinary 403', async () => {
    const { needsAck, clearAck } = usePrivacyAck()
    clearAck()
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: async () => JSON.stringify({ error: 'insufficient privilege' }),
    })
    await expect(api.get('/villages')).rejects.toMatchObject({ status: 403 })
    expect(needsAck.value).toBe(false)
  })
})
