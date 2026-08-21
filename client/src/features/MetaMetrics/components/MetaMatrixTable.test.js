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
    csvFilename: 'meta-outcomes-counts-2026-01-01-2026-08-21.csv',
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
    mountTable({ view: 'share' })
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
    mountTable({ view: 'share' })
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
    mountTable({ view: 'share' })
    expect(screen.getByText('Hub')).toBeInTheDocument()
  })

  it('offers a CSV download', () => {
    mountTable()
    expect(screen.getByRole('button', { name: /download csv/i })).toBeInTheDocument()
  })

  // The table IS the chart's legend (Chart.js's own legend is off), so each
  // series header needs the swatch that maps it to its bars. Village and
  // Total are not series and must get none.
  it('renders a color swatch on each series header, and none on Village or Total', () => {
    const { container } = mountTable()
    const headers = container.querySelectorAll('.meta-matrix-table th')
    const swatchCounts = [...headers].map(h => h.querySelectorAll('.swatch').length)
    // columns are [Village, Completed, Cancelled, Unmatched, Total]
    expect(swatchCounts).toEqual([0, 1, 1, 1, 0])
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
