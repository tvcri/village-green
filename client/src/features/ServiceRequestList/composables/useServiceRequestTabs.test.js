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
    await t.fetchHistoric()
    for (const call of fetcher.mock.calls) {
      expect(call[0].status).not.toContain('draft')
    }
  })

  it('defaults the historic window to the last 60 days ending today', () => {
    const { historicStart, historicEnd } = useServiceRequestTabs({
      fetcher: vi.fn().mockResolvedValue([]), today: '2026-07-26'
    })
    expect(historicStart.value).toBe('2026-05-27')
    expect(historicEnd.value).toBe('')
  })

  it('fetches Historic with terminal statuses and the window', async () => {
    const fetcher = vi.fn().mockResolvedValue([])
    const { fetchHistoric } = useServiceRequestTabs({ fetcher, today: '2026-07-26' })
    await fetchHistoric()
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
    t.activeTab.value = 'historic'
    await t.fetchHistoric()
    await flush()
    expect(t.currentRows.value.map(r => r.serviceRequestId)).toEqual(['b'])
  })

  it('fetchCurrent refetches only the visible tab', async () => {
    const fetcher = vi.fn().mockResolvedValue([])
    const t = useServiceRequestTabs({ fetcher, today: '2026-07-26' })
    t.activeTab.value = 'historic'
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
    await t.fetchHistoric()
    expect(fetcher).not.toHaveBeenCalled()
    // rows survive rather than blanking
    expect(t.currentRows.value.map(r => r.serviceRequestId)).toEqual(['a'])
  })

  it('offers exactly the statuses the visible tab fetched', () => {
    const t = useServiceRequestTabs({ fetcher: vi.fn().mockResolvedValue([]), today: '2026-07-26' })
    expect(t.statusOptions.value).toEqual(['open', 'confirmed'])
    t.activeTab.value = 'historic'
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

  it('does not fetch Historic when the From date is cleared', async () => {
    // serviceDateStart is required by the endpoint; a cleared input must not
    // fire a doomed request that lands the tab in an error state.
    const fetcher = vi.fn().mockResolvedValue([])
    const t = useServiceRequestTabs({ fetcher, today: '2026-07-26' })
    t.historicStart.value = ''
    await t.fetchHistoric()
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('discards an out-of-order response', async () => {
    let resolveFirst, resolveSecond
    const fetcher = vi.fn()
      .mockImplementationOnce(() => new Promise(r => { resolveFirst = r }))
      .mockImplementationOnce(() => new Promise(r => { resolveSecond = r }))
    const t = useServiceRequestTabs({ fetcher, today: '2026-07-26' })
    const first = t.fetchHistoric()
    const second = t.fetchHistoric()
    resolveSecond([{ serviceRequestId: 'newer' }])
    await second
    resolveFirst([{ serviceRequestId: 'stale' }])
    await first
    expect(t.historicRows.value.map(r => r.serviceRequestId)).toEqual(['newer'])
  })

  it('crossing a month boundary shifts the window on the civil calendar', () => {
    // 60 days before 2026-03-01 is 2025-12-31 — no local timezone may shift it.
    const { historicStart } = useServiceRequestTabs({
      fetcher: vi.fn().mockResolvedValue([]), today: '2026-03-01'
    })
    expect(historicStart.value).toBe('2025-12-31')
  })
})
