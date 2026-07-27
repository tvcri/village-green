// @vitest-environment jsdom
import { render, screen, cleanup } from '@testing-library/vue'
import { describe, it, expect, afterEach } from 'vitest'
import PrimeVue from 'primevue/config'
import MetricsPieCard from './MetricsPieCard.vue'

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
})
