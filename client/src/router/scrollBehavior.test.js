// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

// scrollBehavior is defined inline in the router options, so pull it back off
// the constructed router rather than exporting it purely for the test.
const { default: router } = await import('./index.js')

const { scrollBehavior } = router.options

describe('router scrollBehavior', () => {
  it('keeps the scroll position when only the query changes', () => {
    // The metrics tab and VolunteerHome's tab are URL-backed: selecting one
    // calls router.replace({ query: ... }), which is a full navigation. Going
    // to top there yanks the user away from the content they are reading.
    const to = { path: '/villages/1/metrics', query: { tab: 'services' } }
    const from = { path: '/villages/1/metrics', query: { tab: 'categories' } }

    expect(scrollBehavior(to, from)).toBe(false)
  })

  it('keeps the scroll position when the metrics date range changes', () => {
    const to = { path: '/villages/1/metrics', query: { start: '2026-01-01' } }
    const from = { path: '/villages/1/metrics', query: { start: '2026-05-02' } }

    expect(scrollBehavior(to, from)).toBe(false)
  })

  it('scrolls to top on a real page change', () => {
    const to = { path: '/villages/1/members', query: {} }
    const from = { path: '/villages/1/metrics', query: {} }

    expect(scrollBehavior(to, from)).toEqual({ top: 0 })
  })

  it('scrolls to top when only the params change', () => {
    // Same route, different village: a different page's worth of content, so
    // the previous scroll offset is meaningless.
    const to = { path: '/villages/2/metrics', query: {} }
    const from = { path: '/villages/1/metrics', query: {} }

    expect(scrollBehavior(to, from)).toEqual({ top: 0 })
  })
})
