// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { nextTick } from 'vue'
import { useServiceRequestWindow } from './useServiceRequestWindow.js'

const flush = async () => { await nextTick(); await new Promise(r => setTimeout(r, 0)); await nextTick() }

describe('useServiceRequestWindow', () => {
  it('defaults the window to the last 30 days, unbounded above', () => {
    const { windowStart, windowEnd, windowStartDefault } = useServiceRequestWindow({
      fetcher: vi.fn().mockResolvedValue([]), today: '2026-07-26'
    })
    expect(windowStart.value).toBe('2026-06-26')
    expect(windowEnd.value).toBe('')
    expect(windowStartDefault).toBe('2026-06-26')
  })

  it('fetches all five statuses with the window and no end bound', async () => {
    const fetcher = vi.fn().mockResolvedValue([])
    const { fetchRows } = useServiceRequestWindow({ fetcher, today: '2026-07-26' })
    await fetchRows()
    expect(fetcher).toHaveBeenCalledWith({
      status: ['open', 'confirmed', 'completed', 'unmatched', 'cancelled'],
      serviceDateStart: '2026-06-26',
      serviceDateEnd: undefined
    })
  })

  it('never requests draft', async () => {
    const fetcher = vi.fn().mockResolvedValue([])
    const w = useServiceRequestWindow({ fetcher, today: '2026-07-26' })
    await w.fetchRows()
    expect(fetcher.mock.calls[0][0].status).not.toContain('draft')
  })

  it('passes an upper bound when windowEnd is set', async () => {
    const fetcher = vi.fn().mockResolvedValue([])
    const w = useServiceRequestWindow({ fetcher, today: '2026-07-26' })
    w.windowEnd.value = '2026-07-01'
    await w.fetchRows()
    expect(fetcher.mock.calls[0][0].serviceDateEnd).toBe('2026-07-01')
  })

  it('crossing a month boundary shifts the window on the civil calendar', () => {
    // 30 days before 2026-03-01 is 2026-01-30 — no local timezone may shift it.
    const { windowStart } = useServiceRequestWindow({
      fetcher: vi.fn().mockResolvedValue([]), today: '2026-03-01'
    })
    expect(windowStart.value).toBe('2026-01-30')
  })

  it('makes no request while canFetch is false, keeping the last rows', async () => {
    const fetcher = vi.fn().mockResolvedValue([{ serviceRequestId: 'a' }])
    let allowed = true
    const w = useServiceRequestWindow({
      fetcher, canFetch: () => allowed, today: '2026-07-26'
    })
    await w.fetchRows()
    await flush()
    expect(w.rows.value.map(r => r.serviceRequestId)).toEqual(['a'])

    // e.g. the route's :villageId went away on navigation
    allowed = false
    fetcher.mockClear()
    await w.fetchRows()
    expect(fetcher).not.toHaveBeenCalled()
    expect(w.rows.value.map(r => r.serviceRequestId)).toEqual(['a'])
  })

  it('does not fetch when the From date is cleared', async () => {
    // serviceDateStart is required by the endpoint; a cleared input must not
    // fire a doomed request that lands the list in an error state.
    const fetcher = vi.fn().mockResolvedValue([])
    const w = useServiceRequestWindow({ fetcher, today: '2026-07-26' })
    w.windowStart.value = ''
    await w.fetchRows()
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('drops stale rows when the From date is cleared', async () => {
    // Leaving the previous window's rows under a blank date control would
    // misrepresent them — and an export would ship a window the user isn't
    // looking at.
    const fetcher = vi.fn().mockResolvedValue([{ serviceRequestId: 'old' }])
    const w = useServiceRequestWindow({ fetcher, today: '2026-07-26' })
    await w.fetchRows()
    await flush()
    expect(w.rows.value.map(r => r.serviceRequestId)).toEqual(['old'])

    w.windowStart.value = ''
    await w.fetchRows()
    await flush()
    expect(w.rows.value).toBe(null)
  })

  it('captures a fetch rejection in error and clears isLoading', async () => {
    const boom = new Error('network down')
    const fetcher = vi.fn().mockRejectedValue(boom)
    const w = useServiceRequestWindow({ fetcher, today: '2026-07-26' })
    await w.fetchRows()
    expect(w.error.value).toBe(boom)
    expect(w.isLoading.value).toBe(false)
  })

  it('leaves hasLoadedOnce false when the first fetch fails', async () => {
    // Otherwise the table shows the empty state instead of the error.
    const fetcher = vi.fn().mockRejectedValue(new Error('network down'))
    const w = useServiceRequestWindow({ fetcher, today: '2026-07-26' })
    await w.fetchRows()
    await flush()
    expect(w.hasLoadedOnce.value).toBe(false)
    expect(w.error.value).toBeTruthy()
  })

  it('sets hasLoadedOnce after a successful fetch', async () => {
    const fetcher = vi.fn().mockResolvedValue([])
    const w = useServiceRequestWindow({ fetcher, today: '2026-07-26' })
    expect(w.hasLoadedOnce.value).toBe(false)
    await w.fetchRows()
    await flush()
    expect(w.hasLoadedOnce.value).toBe(true)
  })

  it('discards an out-of-order response', async () => {
    let resolveFirst, resolveSecond
    const fetcher = vi.fn()
      .mockImplementationOnce(() => new Promise(r => { resolveFirst = r }))
      .mockImplementationOnce(() => new Promise(r => { resolveSecond = r }))
    const w = useServiceRequestWindow({ fetcher, today: '2026-07-26' })
    const first = w.fetchRows()
    const second = w.fetchRows()
    resolveSecond([{ serviceRequestId: 'newer' }])
    await second
    resolveFirst([{ serviceRequestId: 'stale' }])
    await first
    expect(w.rows.value.map(r => r.serviceRequestId)).toEqual(['newer'])
  })
})
