// @vitest-environment jsdom
import { render, screen, cleanup } from '@testing-library/vue'
import { describe, it, expect, afterEach } from 'vitest'
import MetricsSummaryStrip from './MetricsSummaryStrip.vue'

describe('MetricsSummaryStrip', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders 4 labeled stats with values from props', () => {
    const stats = {
      requests: 42,
      completed: 18,
      unmatched: 7,
      cancelled: 5,
    }
    render(MetricsSummaryStrip, {
      props: { stats },
    })

    // Check labels
    expect(screen.getByText('Requests')).toBeTruthy()
    expect(screen.getByText('Completed')).toBeTruthy()
    expect(screen.getByText('Unmatched')).toBeTruthy()
    expect(screen.getByText('Cancelled')).toBeTruthy()

    // Check values — distinct numbers, so each ties to its own stat
    expect(screen.getByText('42')).toBeTruthy()
    expect(screen.getByText('18')).toBeTruthy()
    expect(screen.getByText('7')).toBeTruthy()
    expect(screen.getByText('5')).toBeTruthy()
  })

  it('renders zero counts rather than blanking them', () => {
    render(MetricsSummaryStrip, {
      props: { stats: { requests: 0, completed: 0, unmatched: 0, cancelled: 0 } },
    })

    expect(screen.getAllByText('0')).toHaveLength(4)
  })
})
