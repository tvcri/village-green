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
      topCategory: 'Rides',
      cancelled: 5,
    }
    render(MetricsSummaryStrip, {
      props: { stats },
    })

    // Check labels
    expect(screen.getByText('Requests')).toBeTruthy()
    expect(screen.getByText('Completed')).toBeTruthy()
    expect(screen.getByText('Top category')).toBeTruthy()
    expect(screen.getByText('Cancelled')).toBeTruthy()

    // Check values
    expect(screen.getByText('42')).toBeTruthy()
    expect(screen.getByText('18')).toBeTruthy()
    expect(screen.getByText('Rides')).toBeTruthy()
    expect(screen.getByText('5')).toBeTruthy()
  })

  it('displays em-dash when topCategory is em-dash', () => {
    const stats = {
      requests: 10,
      completed: 5,
      topCategory: '—',
      cancelled: 2,
    }
    render(MetricsSummaryStrip, {
      props: { stats },
    })

    expect(screen.getByText('—')).toBeTruthy()
  })
})
