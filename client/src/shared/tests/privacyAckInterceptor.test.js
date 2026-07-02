import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api/apiClient.js'
import { usePrivacyAck } from '../composables/usePrivacyAck.js'

// Mock global fetch
const fetchMock = vi.fn()
globalThis.fetch = fetchMock

describe('apiClient privacy-ack 403 interceptor', () => {
  beforeEach(() => {
    fetchMock.mockClear()
    vi.clearAllMocks()
    globalThis.VG = {
      curUser: { privacyStatus: { needsAck: false, pendingRulesId: null } },
      Env: { apiBase: 'http://localhost/api' },
      oidcWorker: { token: null },
    }
  })

  it('flips privacy ack gate on 403 privacy_ack_required and still throws', async () => {
    const { needsAck, pendingRulesId, clearAck } = usePrivacyAck()
    clearAck() // ensure starting state
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: async () => JSON.stringify({ error: 'privacy_ack_required', detail: { pendingRulesId: 9 } }),
    })
    await expect(api.get('/villages')).rejects.toMatchObject({ status: 403 })
    expect(needsAck.value).toBe(true)
    expect(pendingRulesId.value).toBe(9)
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
