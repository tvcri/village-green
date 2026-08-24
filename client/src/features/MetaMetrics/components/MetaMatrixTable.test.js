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

// The first body row is the pinned 'All Villages' totals line, not a village.
// Tests that index rows want the VILLAGE rows beneath it.
const villageRows = (container) =>
  [...container.querySelectorAll('.meta-matrix-table tbody tr:not(.totals-row)')]

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
    // Scoped to the column header: the totals ROW is labelled 'All Villages',
    // but keeping this on columnheader guards the header specifically.
    expect(screen.getByRole('columnheader', { name: 'Total' })).toBeInTheDocument()
  })

  it('names the last column Requests in share view', () => {
    mountTable({ view: 'percent' })
    expect(screen.getByText('Requests')).toBeInTheDocument()
  })

  it('renders rows in the order given, without re-sorting them', () => {
    mountTable({ sort: 'unmatched', dir: 'desc' })
    const cells = screen.getAllByRole('cell').map(c => c.textContent.trim())
    // cells[0] is the pinned totals line; the villages start after it.
    // Parent passed Barrington first; the table must not reorder to put
    // East Greenwich (higher unmatched) on top.
    const names = cells.filter(t => t === 'Barrington' || t === 'East Greenwich')
    expect(names).toEqual(['Barrington', 'East Greenwich'])
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

  it('renders the totals line in counts view', () => {
    mountTable({ view: 'counts' })
    expect(screen.getByText('712')).toBeInTheDocument()
  })

  it('labels the totals line All Villages in both views', () => {
    mountTable({ view: 'counts' })
    expect(screen.getByText('All Villages')).toBeInTheDocument()
    cleanup()
    mountTable({ view: 'percent' })
    expect(screen.getByText('All Villages')).toBeInTheDocument()
  })

  // The customer asked for the totals as the FIRST line of the table, which is
  // why it rides in the body instead of the <tfoot> it used to occupy.
  it('puts the totals line first, above every village row', () => {
    const { container } = mountTable()
    const firstRow = container.querySelector('.meta-matrix-table tbody tr')
    expect(firstRow).toHaveClass('totals-row')
    expect(firstRow.textContent).toContain('All Villages')
  })

  it('keeps the totals line first under any sort', () => {
    const { container } = mountTable({ sort: 'completed', dir: 'desc' })
    const rows = [...container.querySelectorAll('.meta-matrix-table tbody tr')]
    expect(rows[0]).toHaveClass('totals-row')
    expect(rows.slice(1).some(r => r.classList.contains('totals-row'))).toBe(false)
  })

  // As the footer drew none: a hub-wide bar is on a different scale from the
  // per-village bars beneath it, and inviting the comparison would mislead.
  // In counts the track carries magnitude against the busiest VILLAGE, and the
  // hub total is the sum of every village — there is no shared denominator that
  // could place it honestly beside the rows below.
  it('draws no bar on the totals line in counts view', () => {
    const { container } = mountTable({ view: 'counts' })
    const firstRow = container.querySelector('.meta-matrix-table tbody tr')
    expect(firstRow.querySelector('.bar-track')).toBeNull()
    // The village rows below it still draw theirs.
    const villageRow = container.querySelectorAll('.meta-matrix-table tbody tr')[1]
    expect(villageRow.querySelector('.bar-track')).not.toBeNull()
  })

  // In share every track is full width, so the hub-wide bar is exactly as long
  // as the village bars and reads as the same partition taken over all of them.
  it('draws a bar on the totals line in share view', () => {
    const { container } = mountTable({ view: 'percent' })
    const firstRow = container.querySelector('.meta-matrix-table tbody tr')
    const track = firstRow.querySelector('.bar-track')
    expect(track).not.toBeNull()
    expect(track.querySelectorAll('.bar-seg')).toHaveLength(STATUS_SERIES.length)
  })

  it('gives the totals bar the same length as every village bar in share view', () => {
    const { container } = mountTable({ view: 'percent' })
    const tracks = [...container.querySelectorAll('.bar-track')]
    // One per village plus the totals line.
    expect(tracks).toHaveLength(ROWS.length + 1)
    for (const track of tracks) expect(track.style.width).toBe('100%')
  })

  // The segments are the hub-wide rates, i.e. what matrixFooter puts in the
  // number columns of the same row: completed 712 / 1112 = 64.0%.
  it('splits the totals bar by the hub-wide rate, not by an average of rows', () => {
    const { container } = mountTable({ view: 'percent' })
    const firstRow = container.querySelector('.meta-matrix-table tbody tr')
    const completed = firstRow.querySelector('.bar-seg')
    expect(parseFloat(completed.style.width)).toBeCloseTo(64.0, 1)
    expect(completed.getAttribute('title')).toBe('Completed: 712')
  })

  it('renders no tfoot totals row any more', () => {
    const { container } = mountTable()
    expect(container.querySelector('.meta-matrix-table tfoot')).toBeNull()
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
    const firstRow = villageRows(container)[0]
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
    const rows = villageRows(container)
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
    const rows = villageRows(container)
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
    const nameCell = villageRows(container)[0].querySelector('td')
    expect(nameCell.querySelector('[title]').getAttribute('title')).toBe('Barrington')
  })

  it('titles each segment so its value is reachable on hover', () => {
    const { container } = mountTable()
    expect(container.querySelector('.bar-seg').getAttribute('title')).toBe('Completed: 624')
  })
})
