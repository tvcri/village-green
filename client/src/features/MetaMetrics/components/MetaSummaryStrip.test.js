// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, cleanup } from '@testing-library/vue'
import MetaSummaryStrip from './MetaSummaryStrip.vue'
import { metaStripStats } from '../lib/stripStats.js'

// The live 2026 figures, so the rendered shares are checkable against the page.
const ROWS = [
  { villageId: '1', villageName: 'A', completed: 4000, cancelled: 500, unmatched: 200, total: 4700 },
  { villageId: '2', villageName: 'B', completed: 1161, cancelled: 114, unmatched: 51, total: 1326 },
]

const mountStrip = (rows = ROWS) =>
  render(MetaSummaryStrip, { props: { stats: metaStripStats(rows) } })

afterEach(() => cleanup())

describe('MetaSummaryStrip', () => {
  it('renders all five cards', () => {
    mountStrip()
    for (const label of ['Villages', 'Requests', 'Completed', 'Cancelled', 'Unmatched']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })

  it('thousand-separates the counts', () => {
    const { container } = mountStrip()
    expect(container.textContent).toContain('6,026')
    expect(container.textContent).toContain('5,161')
  })

  it('shows each outcome’s share of requests', () => {
    const { container } = mountStrip()
    const shares = [...container.querySelectorAll('.stat-share')].map(s => s.textContent)
    // 5161/6026, 614/6026, 251/6026
    expect(shares).toEqual(['85.6%', '10.2%', '4.2%'])
  })

  it('gives no share to Villages or Requests, which have no denominator', () => {
    const { container } = mountStrip()
    const cards = [...container.querySelectorAll('.stat-card')]
    expect(cards[0].querySelector('.stat-share')).toBeNull()
    expect(cards[1].querySelector('.stat-share')).toBeNull()
  })

  it('renders no share at all rather than 0.0% for an empty range', () => {
    const { container } = mountStrip([])
    expect(container.querySelectorAll('.stat-share')).toHaveLength(0)
    expect(container.textContent).toContain('0')
  })
})
