// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const postAnalyticsEvents = vi.fn(() => Promise.resolve())

vi.mock('../api/analyticsApi.js', () => ({
  postAnalyticsEvents: (...args) => postAnalyticsEvents(...args),
}))

const VALID = ['mobile', 'tablet', 'desktop', 'unknown']

describe('useAnalytics device stamping', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    postAnalyticsEvents.mockClear()
    vi.resetModules()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('stamps deviceClass on page view events', async () => {
    const { useAnalytics } = await import('./useAnalytics.js')
    const { trackPageView } = useAnalytics()

    trackPageView({ name: 'dashboard', path: '/dashboard' })
    await vi.runAllTimersAsync()

    expect(postAnalyticsEvents).toHaveBeenCalledTimes(1)
    const [batch] = postAnalyticsEvents.mock.calls[0]
    expect(batch).toHaveLength(1)
    expect(VALID).toContain(batch[0].deviceClass)
  })

  it('stamps deviceClass on interaction events', async () => {
    const { useAnalytics } = await import('./useAnalytics.js')
    const { trackEvent } = useAnalytics()

    trackEvent('export_clicked', { format: 'csv' })
    await vi.runAllTimersAsync()

    const [batch] = postAnalyticsEvents.mock.calls[0]
    expect(VALID).toContain(batch[0].deviceClass)
  })

  // metadata keeps its single meaning: the caller-supplied event payload.
  // Device information is a sibling field, never mixed in.
  it('leaves caller metadata untouched', async () => {
    const { useAnalytics } = await import('./useAnalytics.js')
    const { trackEvent } = useAnalytics()

    trackEvent('export_clicked', { format: 'csv' })
    await vi.runAllTimersAsync()

    const [batch] = postAnalyticsEvents.mock.calls[0]
    expect(batch[0].metadata).toEqual({ format: 'csv' })
  })
})
