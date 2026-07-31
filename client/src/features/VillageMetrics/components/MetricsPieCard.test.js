// @vitest-environment jsdom
import { render, screen, cleanup, fireEvent } from '@testing-library/vue'
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import PrimeVue from 'primevue/config'
import MetricsPieCard from './MetricsPieCard.vue'
import * as csvUtils from '../../../shared/lib/csvUtils.js'

// jsdom has no canvas rendering, so Chart.js internals are never asserted on here.
// Stub primevue/chart with a trivial component so mounting doesn't touch canvas at all.
const ChartStub = { name: 'Chart', props: ['type', 'data', 'options'], template: '<canvas />' }

const SLICES = [
  { label: 'Rides', value: 8, color: '#22c55e' },
  { label: 'Errands', value: 2, color: '#f59e0b' },
]

const ROWS = [
  { label: 'Rides', value: 8, color: '#22c55e', pct: 0.8 },
  { label: 'Errands', value: 2, color: '#f59e0b', pct: 0.2 },
]

function mountCard (props) {
  return render(MetricsPieCard, {
    props: { slices: SLICES, rows: ROWS, emptyMessage: 'No data in this range.', ...props },
    global: { plugins: [PrimeVue], stubs: { Chart: ChartStub } },
  })
}

describe('MetricsPieCard', () => {
  beforeEach(() => {
    window.matchMedia = () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} })
  })

  afterEach(() => cleanup())

  it('renders one row per rows entry with label, value, and formatted pct', () => {
    mountCard({})
    expect(screen.getByText('Rides')).toBeTruthy()
    expect(screen.getByText('Errands')).toBeTruthy()
    expect(screen.getByText('8')).toBeTruthy()
    expect(screen.getByText('2')).toBeTruthy()
    expect(screen.getByText('80%')).toBeTruthy()
    expect(screen.getByText('20%')).toBeTruthy()
  })

  it('shows emptyMessage in place of the chart when slices is empty, but still renders rows', () => {
    mountCard({ slices: [] })
    expect(screen.getByText('No data in this range.')).toBeTruthy()
    // rows table still renders even though there are no slices
    expect(screen.getByText('Rides')).toBeTruthy()
    expect(screen.getByText('80%')).toBeTruthy()
  })

  it('renders the chart canvas when slices are present', () => {
    mountCard({})
    expect(document.querySelector('canvas')).toBeTruthy()
  })

  it('tolerates a single-slice pie (servicePie "Other" collapse edge case)', () => {
    mountCard({
      slices: [{ label: 'Other', value: 10, color: '#94a3b8' }],
      rows: [{ label: 'Other', value: 10, color: '#94a3b8', pct: 1 }],
    })
    expect(screen.getByText('Other')).toBeTruthy()
    expect(screen.getByText('100%')).toBeTruthy()
    expect(document.querySelector('canvas')).toBeTruthy()
  })

  // Mirrors the PDF legend's Total line (see `legend` in metricsPdf.js).
  it('renders a Total row summing the displayed values', () => {
    mountCard({})
    const foot = document.querySelector('.legend-table tfoot')
    expect(foot).toBeTruthy()
    expect(foot.textContent).toContain('Total')
    expect(foot.textContent).toContain('10') // 8 + 2
  })

  it('sums the rows as displayed, including a merged Other row', () => {
    mountCard({
      slices: [{ label: 'Rides', value: 5, color: '#22c55e' }],
      rows: [
        { label: 'Rides', value: 5, color: '#22c55e', pct: 0.5 },
        { label: 'Other', value: 5, color: '#94a3b8', pct: 0.5 },
      ],
    })
    expect(document.querySelector('.legend-table tfoot').textContent).toContain('10')
  })

  it('omits the Total row entirely when there are no rows', () => {
    mountCard({ slices: [], rows: [] })
    expect(document.querySelector('.legend-table tfoot')).toBeNull()
    expect(screen.queryByText('Total')).toBeNull()
  })

  it('shows no download button without a csvFilename', () => {
    mountCard({ csvFilename: '' })
    expect(screen.queryByRole('button', { name: /download csv/i })).toBeNull()
  })

  it('downloads the legend rows as CSV', async () => {
    const spy = vi.spyOn(csvUtils, 'downloadCsv').mockImplementation(() => {})
    mountCard({
      rows: [
        { label: 'Rides', value: 704, color: '#22c55e', pct: 0.8009 },
        { label: 'Errands', value: 53, color: '#f59e0b', pct: 0.0603 },
      ],
      csvFilename: 'sample-categories-2026-01-01-2026-07-30.csv',
    })

    await fireEvent.click(screen.getByRole('button', { name: /download csv/i }))

    expect(spy).toHaveBeenCalledTimes(1)
    const [csv, filename] = spy.mock.calls[0]
    expect(filename).toBe('sample-categories-2026-01-01-2026-07-30.csv')
    expect(csv.split('\n')[0]).toBe('Label,Value,Pct')
    expect(csv).toContain('Rides,704,80%')
    spy.mockRestore()
  })
})
