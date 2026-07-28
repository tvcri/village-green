// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { nextTick } from 'vue'
import { useServiceRequestTabs } from './useServiceRequestTabs.js'

const flush = async () => { await nextTick(); await new Promise(r => setTimeout(r, 0)); await nextTick() }

describe('useServiceRequestTabs', () => {
  it('opens on the Active tab', () => {
    const { activeTab } = useServiceRequestTabs({ fetcher: vi.fn().mockResolvedValue([]), today: '2026-07-26' })
    expect(activeTab.value).toBe('active')
  })

  it('fetches Active with open+confirmed and no end bound', async () => {
    const fetcher = vi.fn().mockResolvedValue([])
    const { fetchActive } = useServiceRequestTabs({ fetcher, today: '2026-07-26' })
    await fetchActive()
    expect(fetcher).toHaveBeenCalledWith(expect.objectContaining({
      status: ['open', 'confirmed'],
      serviceDateEnd: undefined
    }))
  })

  it('never requests draft in either tab', async () => {
    const fetcher = vi.fn().mockResolvedValue([])
    const t = useServiceRequestTabs({ fetcher, today: '2026-07-26' })
    await t.fetchActive()
    await t.fetchClosed()
    for (const call of fetcher.mock.calls) {
      expect(call[0].status).not.toContain('draft')
    }
  })

  it('defaults the Closed window to the last 60 days ending today', () => {
    const { closedStart, closedEnd } = useServiceRequestTabs({
      fetcher: vi.fn().mockResolvedValue([]), today: '2026-07-26'
    })
    expect(closedStart.value).toBe('2026-05-27')
    expect(closedEnd.value).toBe('')
  })

  it('fetches Closed with terminal statuses and the window', async () => {
    const fetcher = vi.fn().mockResolvedValue([])
    const { fetchClosed } = useServiceRequestTabs({ fetcher, today: '2026-07-26' })
    await fetchClosed()
    expect(fetcher).toHaveBeenCalledWith(expect.objectContaining({
      status: ['completed', 'unmatched', 'cancelled'],
      serviceDateStart: '2026-05-27'
    }))
  })

  it('currentRows follows the selected tab', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce([{ serviceRequestId: 'a' }])
      .mockResolvedValueOnce([{ serviceRequestId: 'b' }])
    const t = useServiceRequestTabs({ fetcher, today: '2026-07-26' })
    await t.fetchActive()
    await flush()
    expect(t.currentRows.value.map(r => r.serviceRequestId)).toEqual(['a'])
    t.activeTab.value = 'closed'
    await t.fetchClosed()
    await flush()
    expect(t.currentRows.value.map(r => r.serviceRequestId)).toEqual(['b'])
  })

  it('fetchCurrent refetches only the visible tab', async () => {
    const fetcher = vi.fn().mockResolvedValue([])
    const t = useServiceRequestTabs({ fetcher, today: '2026-07-26' })
    t.activeTab.value = 'closed'
    await t.fetchCurrent()
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher.mock.calls[0][0].status).toEqual(['completed', 'unmatched', 'cancelled'])
  })

  it('makes no request while canFetch is false, keeping the last rows', async () => {
    const fetcher = vi.fn().mockResolvedValue([{ serviceRequestId: 'a' }])
    let allowed = true
    const t = useServiceRequestTabs({
      fetcher, canFetch: () => allowed, today: '2026-07-26'
    })
    await t.fetchActive()
    await flush()
    expect(t.currentRows.value.map(r => r.serviceRequestId)).toEqual(['a'])

    // e.g. the route's :villageId went away on navigation
    allowed = false
    fetcher.mockClear()
    await t.fetchActive()
    await t.fetchClosed()
    expect(fetcher).not.toHaveBeenCalled()
    // rows survive rather than blanking
    expect(t.currentRows.value.map(r => r.serviceRequestId)).toEqual(['a'])
  })

  it('offers exactly the statuses the visible tab fetched', () => {
    const t = useServiceRequestTabs({ fetcher: vi.fn().mockResolvedValue([]), today: '2026-07-26' })
    expect(t.statusOptions.value).toEqual(['open', 'confirmed'])
    t.activeTab.value = 'closed'
    expect(t.statusOptions.value).toEqual(['completed', 'unmatched', 'cancelled'])
  })

  it('captures a fetch rejection in error and clears isLoading', async () => {
    const boom = new Error('network down')
    const fetcher = vi.fn().mockRejectedValue(boom)
    const t = useServiceRequestTabs({ fetcher, today: '2026-07-26' })
    await t.fetchActive()
    expect(t.error.value).toBe(boom)
    expect(t.isLoading.value).toBe(false)
  })

  it('does not fetch Closed when the From date is cleared', async () => {
    // serviceDateStart is required by the endpoint; a cleared input must not
    // fire a doomed request that lands the tab in an error state.
    const fetcher = vi.fn().mockResolvedValue([])
    const t = useServiceRequestTabs({ fetcher, today: '2026-07-26' })
    t.closedStart.value = ''
    await t.fetchClosed()
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('drops stale rows when the From date is cleared', async () => {
    // Leaving the previous window's rows under a blank date control would
    // misrepresent them as the current window — and an export would ship a
    // window the user isn't looking at.
    const fetcher = vi.fn().mockResolvedValue([{ serviceRequestId: 'old' }])
    const t = useServiceRequestTabs({ fetcher, today: '2026-07-26' })
    t.activeTab.value = 'closed'
    await t.fetchClosed()
    await flush()
    expect(t.currentRows.value.map(r => r.serviceRequestId)).toEqual(['old'])

    t.closedStart.value = ''
    await t.fetchClosed()
    await flush()
    expect(t.currentRows.value).toBe(null)
  })

  it('tracks hasLoadedOnce per tab', async () => {
    // A shared flag would let Active's load mark Closed as loaded, so
    // Closed's first fetch would render "no requests found" over a spinner.
    const fetcher = vi.fn().mockResolvedValue([])
    const t = useServiceRequestTabs({ fetcher, today: '2026-07-26' })
    expect(t.hasLoadedOnce.value).toBe(false)

    await t.fetchActive()
    await flush()
    expect(t.hasLoadedOnce.value).toBe(true)

    t.activeTab.value = 'closed'
    expect(t.hasLoadedOnce.value).toBe(false)

    await t.fetchClosed()
    await flush()
    expect(t.hasLoadedOnce.value).toBe(true)
  })

  it("leaves hasLoadedOnce false when a tab's first fetch fails", async () => {
    // Otherwise the table shows the empty state instead of the error.
    const fetcher = vi.fn().mockRejectedValue(new Error('network down'))
    const t = useServiceRequestTabs({ fetcher, today: '2026-07-26' })
    await t.fetchActive()
    await flush()
    expect(t.hasLoadedOnce.value).toBe(false)
    expect(t.error.value).toBeTruthy()
  })

  it('discards an out-of-order response', async () => {
    let resolveFirst, resolveSecond
    const fetcher = vi.fn()
      .mockImplementationOnce(() => new Promise(r => { resolveFirst = r }))
      .mockImplementationOnce(() => new Promise(r => { resolveSecond = r }))
    const t = useServiceRequestTabs({ fetcher, today: '2026-07-26' })
    const first = t.fetchClosed()
    const second = t.fetchClosed()
    resolveSecond([{ serviceRequestId: 'newer' }])
    await second
    resolveFirst([{ serviceRequestId: 'stale' }])
    await first
    expect(t.closedRows.value.map(r => r.serviceRequestId)).toEqual(['newer'])
  })

  it('crossing a month boundary shifts the window on the civil calendar', () => {
    // 60 days before 2026-03-01 is 2025-12-31 — no local timezone may shift it.
    const { closedStart } = useServiceRequestTabs({
      fetcher: vi.fn().mockResolvedValue([]), today: '2026-03-01'
    })
    expect(closedStart.value).toBe('2025-12-31')
  })
})
