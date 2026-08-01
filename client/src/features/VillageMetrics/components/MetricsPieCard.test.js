// @vitest-environment jsdom
import { render, screen, cleanup, fireEvent } from '@testing-library/vue'
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import PrimeVue from 'primevue/config'
import MetricsPieCard from './MetricsPieCard.vue'
import * as csvUtils from '../../../shared/lib/csvUtils.js'

// Captures the props Chart was rendered with, so tests can assert on chart
// type and options without a canvas. Reset in beforeEach.
let chartProps = null
const ChartStub = {
  name: 'Chart',
  props: ['type', 'data', 'options'],
  setup (props) {
    chartProps = props
    return () => null
  },
}

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
    chartProps = null
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

  it('renders the chart when slices are present', () => {
    mountCard({})
    expect(chartProps).not.toBeNull()
  })

  it('tolerates a single-slice pie (servicePie "Other" collapse edge case)', () => {
    mountCard({
      slices: [{ label: 'Other', value: 10, color: '#94a3b8' }],
      rows: [{ label: 'Other', value: 10, color: '#94a3b8', pct: 1 }],
    })
    expect(screen.getByText('Other')).toBeTruthy()
    expect(screen.getByText('100%')).toBeTruthy()
    expect(chartProps).not.toBeNull()
  })

  it('renders a pie chart by default', () => {
    mountCard({})
    expect(chartProps.type).toBe('pie')
    expect(chartProps.options.indexAxis).toBeUndefined()
  })

  it('renders a horizontal bar chart when chartType is bar', () => {
    mountCard({ chartType: 'bar' })
    expect(chartProps.type).toBe('bar')
    expect(chartProps.options.indexAxis).toBe('y')
  })

  // ---- bar entry animation ----
  // Chart.js's default numeric animations are pie/line-oriented (x, y,
  // borderWidth, radius, tension) and the bar controller overrides them, so
  // bars appeared fully drawn while the pie swept in. The explicit animations.x
  // is what restores the grow-in. It reads as decorative config — pinning it so
  // a tidy-up of chartOptions cannot silently delete it, since the loss is
  // invisible in review and only shows in a browser.
  it('animates bar length from the axis origin', () => {
    mountCard({ chartType: 'bar' })
    const x = chartProps.options.animations?.x
    expect(x).toBeTruthy()
    expect(x.type).toBe('number')
    expect(x.duration).toBe(1000)
  })

  it('adds no bar animation config to a pie', () => {
    mountCard({})
    expect(chartProps.options.animations).toBeUndefined()
  })

  // `from` applies ONLY to the initial render. Without the mode check, every
  // status-filter or legs change would collapse the bars to zero and regrow
  // them instead of sliding to the new values.
  it('starts the initial bar render at the axis zero', () => {
    mountCard({ chartType: 'bar' })
    const ctx = {
      type: 'data',
      mode: 'default',
      chart: { scales: { x: { getPixelForValue: v => (v === 0 ? 42 : 999) } } },
    }
    expect(chartProps.options.animations.x.from(ctx)).toBe(42)
  })

  it('leaves later bar updates to animate from their previous value', () => {
    mountCard({ chartType: 'bar' })
    const scales = { x: { getPixelForValue: () => 42 } }
    // a non-initial update: undefined means "animate from where you are"
    expect(chartProps.options.animations.x.from({ type: 'data', mode: 'resize', chart: { scales } })).toBeUndefined()
    expect(chartProps.options.animations.x.from({ type: 'dataset', mode: 'default', chart: { scales } })).toBeUndefined()
  })

  it('hides the built-in chart legend in both modes', () => {
    mountCard({ chartType: 'bar' })
    expect(chartProps.options.plugins.legend.display).toBe(false)
  })

  // Chart.js sets context.parsed to a NUMBER for a pie but an OBJECT for a
  // bar; with indexAxis:'y' the value is on .x. Reading the wrong one puts
  // "[object Object]" in the tooltip.
  it('formats the pie tooltip from a numeric parsed value', () => {
    mountCard({})
    const ctx = { label: 'Rides', parsed: 8, dataset: { data: [8, 2] } }
    expect(chartProps.options.plugins.tooltip.callbacks.label(ctx)).toBe('Rides: 8 (80%)')
  })

  it('formats the bar tooltip from parsed.x', () => {
    mountCard({ chartType: 'bar' })
    const ctx = { label: 'Rides', parsed: { x: 8, y: 0 }, dataset: { data: [8, 2] } }
    expect(chartProps.options.plugins.tooltip.callbacks.label(ctx)).toBe('Rides: 8 (80%)')
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

  it('does not apply bar-mode layout for a pie', () => {
    mountCard({})
    expect(document.querySelector('.pie-card.bar-mode')).toBeNull()
  })

  it('applies bar-mode layout for a bar chart', () => {
    mountCard({ chartType: 'bar' })
    expect(document.querySelector('.pie-card.bar-mode')).toBeTruthy()
  })

  // A FLOOR, not a height: the chart is a flex sibling of the legend, so it
  // stretches to the legend's height for free. min-height only bites when the
  // bar count needs more room than that. 2 bars * 44 + 48 = 136.
  //
  // On mobile the card stacks, there is no sibling to stretch against, and this
  // floor becomes the ACTUAL height — which is why the per-bar band is 44 and
  // not the 28 that sufficed while desktop's legend always won.
  it('floors the bar chart container height at the slice count', () => {
    mountCard({ chartType: 'bar' })
    expect(document.querySelector('.chart-container').style.minHeight).toBe('136px')
  })

  it('grows the floor with each additional bar', () => {
    mountCard({
      chartType: 'bar',
      slices: [
        { label: 'A', value: 3, color: '#111' },
        { label: 'B', value: 2, color: '#222' },
        { label: 'C', value: 1, color: '#333' },
      ],
    })
    // 3 bars * 44 + 48 = 180 — one band more than the two-bar case above
    expect(document.querySelector('.chart-container').style.minHeight).toBe('180px')
  })

  // Setting `height` would opt the chart out of the flex row's stretch, which
  // is exactly what left a 3-bar chart in a stub of a box beside a tall table.
  it('sets no fixed height in bar mode, so the column can stretch', () => {
    mountCard({ chartType: 'bar' })
    expect(document.querySelector('.chart-container').style.height).toBe('')
  })

  // No bars to measure — an empty container must not collapse to zero, or the
  // empty message has nowhere to render.
  it('falls back to a fixed floor for an empty bar chart', () => {
    mountCard({ chartType: 'bar', slices: [] })
    expect(document.querySelector('.chart-container').style.minHeight).toBe('280px')
  })

  // The pie keeps its CSS-driven square; no inline sizing at all.
  it('leaves the pie container height to CSS', () => {
    mountCard({})
    expect(document.querySelector('.chart-container').style.height).toBe('')
    expect(document.querySelector('.chart-container').style.minHeight).toBe('')
  })
})
