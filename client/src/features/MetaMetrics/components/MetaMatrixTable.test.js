// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/vue'
import PrimeVue from 'primevue/config'
import MetaMatrixTable from './MetaMatrixTable.vue'
import { STATUS_SERIES } from '../lib/reduceCells.js'

const ROWS = [
  { villageId: '1', villageName: 'Barrington',     completed: 624, cancelled: 291, unmatched: 4,  total: 919 },
  { villageId: '2', villageName: 'East Greenwich', completed: 88,  cancelled: 61,  unmatched: 44, total: 193 },
]

const mountTable = (props = {}) => render(MetaMatrixTable, {
  props: {
    rows: ROWS,
    series: STATUS_SERIES,
    view: 'counts',
    sort: 'villageName',
    dir: 'asc',
    csvFilename: 'tvcri-outcomes-counts-2026-01-01-2026-08-21.csv',
    ...props,
  },
  global: { plugins: [PrimeVue] },
})

beforeEach(() => { vi.restoreAllMocks() })
afterEach(() => cleanup())

describe('MetaMatrixTable', () => {
  it('renders a Village column and one column per series', () => {
    mountTable()
    expect(screen.getByText('Village')).toBeInTheDocument()
    expect(screen.getByText('Completed')).toBeInTheDocument()
    expect(screen.getByText('Cancelled')).toBeInTheDocument()
    expect(screen.getByText('Unmatched')).toBeInTheDocument()
  })

  it('names the last column Total in counts view', () => {
    mountTable({ view: 'counts' })
    // Counts view also labels the footer row 'Total' (see the footer test
    // below), so 'Total' appears twice; scope to the column header.
    expect(screen.getByRole('columnheader', { name: 'Total' })).toBeInTheDocument()
  })

  it('names the last column Requests in share view', () => {
    mountTable({ view: 'percent' })
    expect(screen.getByText('Requests')).toBeInTheDocument()
  })

  it('renders rows in the order given, without re-sorting them', () => {
    mountTable({ sort: 'unmatched', dir: 'desc' })
    const cells = screen.getAllByRole('cell').map(c => c.textContent.trim())
    // Parent passed Barrington first; the table must not reorder to put
    // East Greenwich (higher unmatched) on top.
    expect(cells[0]).toBe('Barrington')
  })

  it('shows percentages in share view', () => {
    mountTable({ view: 'percent' })
    expect(screen.getByText('22.8%')).toBeInTheDocument()
  })

  it('emits update:sort when a sortable header is clicked', async () => {
    const { emitted } = mountTable()
    await fireEvent.click(screen.getByText('Unmatched'))
    expect(emitted()['update:sort']).toBeTruthy()
    expect(emitted()['update:sort'][0][0]).toMatchObject({ sort: 'unmatched' })
  })

  it('renders a Total footer row in counts view', () => {
    mountTable({ view: 'counts' })
    expect(screen.getByText('712')).toBeInTheDocument()
  })

  it('labels the footer Hub in share view', () => {
    mountTable({ view: 'percent' })
    expect(screen.getByText('Hub')).toBeInTheDocument()
  })

  // There is no chart and no separate legend: each series header's swatch is
  // what maps that column's name to the bars drawn in its rows. Village and
  // Total are not series and must get none.
  it('renders a color swatch on each series header, and none on Village or Total', () => {
    const { container } = mountTable()
    const headers = container.querySelectorAll('.meta-matrix-table th')
    const swatchCounts = [...headers].map(h => h.querySelectorAll('.swatch').length)
    // columns are [Village, Completed, Cancelled, Unmatched, Total, bar]
    // The bar column's header is deliberately blank — the swatches above name
    // the colors it draws.
    expect(swatchCounts).toEqual([0, 1, 1, 1, 0, 0])
  })

  it('picks the light swatch color by default and the dark one when dark is true', () => {
    // jsdom normalizes an inline hex to rgb(), so compare via the DOM's own
    // parsed value rather than string-matching the source hex.
    const light = STATUS_SERIES.find(s => s.key === 'completed').colorLight
    const dark = STATUS_SERIES.find(s => s.key === 'completed').colorDark
    const probe = document.createElement('span')

    const { container: lightContainer } = mountTable({ dark: false })
    probe.style.backgroundColor = light
    expect(lightContainer.querySelector('.swatch').style.backgroundColor).toBe(probe.style.backgroundColor)
    cleanup()

    const { container: darkContainer } = mountTable({ dark: true })
    probe.style.backgroundColor = dark
    expect(darkContainer.querySelector('.swatch').style.backgroundColor).toBe(probe.style.backgroundColor)
  })
})

// The bar is a column of this table rather than a separate chart, so that a
// village's bar and its numbers are structurally on the same line and cannot
// drift apart. These assert that pairing, not the pixel math (barGeometry.test.js
// owns that).
describe('MetaMatrixTable in-row bars', () => {
  it('draws one bar per row, each with one segment per series', () => {
    const { container } = mountTable()
    const tracks = container.querySelectorAll('.bar-track')
    expect(tracks).toHaveLength(ROWS.length)
    for (const track of tracks) {
      expect(track.querySelectorAll('.bar-seg')).toHaveLength(STATUS_SERIES.length)
    }
  })

  it('puts each row’s bar in that row, beside its own numbers', () => {
    const { container } = mountTable()
    const firstRow = container.querySelectorAll('.meta-matrix-table tbody tr')[0]
    expect(firstRow.textContent).toContain('Barrington')
    // Barrington's completed count and its bar are in the SAME <tr>.
    expect(firstRow.textContent).toContain('624')
    expect(firstRow.querySelectorAll('.bar-seg')).toHaveLength(STATUS_SERIES.length)
  })

  it('scales counts against one shared denominator so bars compare across villages', () => {
    // A stacked bar draws a count as segment-share OF a scaled track, so the
    // cross-village comparison lives in the product of the two, not in the
    // segment width alone. Barrington completed 624, East Greenwich 88 — that
    // ratio must survive the composition.
    const { container } = mountTable({ view: 'counts' })
    const rows = container.querySelectorAll('.meta-matrix-table tbody tr')
    const drawnWidth = (tr, i) => {
      const track = parseFloat(tr.querySelector('.bar-track').style.width)
      const seg = parseFloat(tr.querySelectorAll('.bar-seg')[i].style.width)
      return (track / 100) * seg
    }
    expect(drawnWidth(rows[0], 0) / drawnWidth(rows[1], 0)).toBeCloseTo(624 / 88, 1)
  })

  it('fills the same track for every row in share view', () => {
    const { container } = mountTable({ view: 'percent' })
    const total = tr => [...tr.querySelectorAll('.bar-seg')]
      .reduce((sum, s) => sum + parseFloat(s.style.width), 0)
    const rows = container.querySelectorAll('.meta-matrix-table tbody tr')
    expect(total(rows[0])).toBeCloseTo(total(rows[1]), 0)
  })

  it('colors the bar segments for the active theme', () => {
    const probe = document.createElement('span')
    probe.style.backgroundColor = STATUS_SERIES[0].colorDark
    const { container } = mountTable({ dark: true })
    expect(container.querySelector('.bar-seg').style.backgroundColor).toBe(probe.style.backgroundColor)
  })

  it('scales the track in counts view and fills it in share view', () => {
    // Not cosmetic, and the only thing the view changes about the bar. Every
    // tab draws one composed bar in both views, because the series partition
    // the row; in counts the track's LENGTH carries the row total, so a village
    // short of the busiest one draws short. In share every track is full.
    const { container: counts } = mountTable({ view: 'counts' })
    const countsTracks = counts.querySelectorAll('.bar-track')
    expect(countsTracks[0].style.width).toBe('100%')          // the busiest
    expect(countsTracks[1].style.width).not.toBe('100%')
    cleanup()

    const { container: share } = mountTable({ view: 'percent' })
    for (const track of share.querySelectorAll('.bar-track')) {
      expect(track.style.width).toBe('100%')
    }
  })

  it('titles the village name so an ellipsis-truncated one stays readable', () => {
    // The name column is a fixed width with nowrap + text-overflow, so a name
    // longer than the track truncates rather than wrapping or widening the
    // table. The title attribute is what keeps it recoverable.
    const { container } = mountTable()
    const nameCell = container.querySelector('.meta-matrix-table tbody td')
    expect(nameCell.querySelector('[title]').getAttribute('title')).toBe('Barrington')
  })

  it('titles each segment so its value is reachable on hover', () => {
    const { container } = mountTable()
    expect(container.querySelector('.bar-seg').getAttribute('title')).toBe('Completed: 624')
  })
})
