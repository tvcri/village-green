import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('./apiClient.js', () => ({
  apiCall: vi.fn(),
}))

import { apiCall } from './apiClient.js'
import { getAnalyticsSummary } from './analyticsApi.js'

describe('analyticsApi', () => {
  beforeEach(() => {
    apiCall.mockReset()
    globalThis.VG = { curUser: { canElevate: true } }
  })

  // getSummary is x-elevation-required. Omitting elevate makes the API answer
  // 403 "Request requires parameter elevate=true", which is what the admin
  // Analytics page hit.
  it('getAnalyticsSummary sends elevate', async () => {
    apiCall.mockResolvedValue([])
    await getAnalyticsSummary()
    expect(apiCall).toHaveBeenCalledWith('getSummary', { elevate: true })
  })

  it('getAnalyticsSummary passes filters alongside elevate', async () => {
    apiCall.mockResolvedValue([])
    await getAnalyticsSummary({ from: '2026-01-01T00:00:00Z', to: '2026-12-31T23:59:59Z', userId: '7' })
    expect(apiCall).toHaveBeenCalledWith('getSummary', {
      elevate: true,
      from: '2026-01-01T00:00:00Z',
      to: '2026-12-31T23:59:59Z',
      userId: '7',
    })
  })

  it('getAnalyticsSummary omits absent filters', async () => {
    apiCall.mockResolvedValue([])
    await getAnalyticsSummary({ from: '2026-01-01T00:00:00Z' })
    expect(apiCall).toHaveBeenCalledWith('getSummary', {
      elevate: true,
      from: '2026-01-01T00:00:00Z',
    })
  })
})
