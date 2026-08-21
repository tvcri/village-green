// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/vue'
import PrimeVue from 'primevue/config'
import MetaChartCard from './MetaChartCard.vue'
import { STATUS_SERIES } from '../lib/reduceCells.js'

let chartRenders = []
vi.mock('primevue/chart', () => ({
  default: {
    name: 'Chart',
    props: ['type', 'data', 'options'],
    setup (props) {
      return () => { chartRenders.push(props); return null }
    },
  },
}))

const ROWS = [
  { villageId: '1', villageName: 'Barrington',     completed: 624, cancelled: 291, unmatched: 4,  total: 919 },
  { villageId: '2', villageName: 'East Greenwich', completed: 88,  cancelled: 61,  unmatched: 44, total: 193 },
]

const mountCard = (props = {}) => render(MetaChartCard, {
  props: {
    rows: ROWS,
    series: STATUS_SERIES,
    view: 'counts',
    sort: 'villageName',
    dir: 'asc',
    csvFilename: 'meta-outcomes-counts.csv',
    chartData: { labels: ['Barrington', 'East Greenwich'], datasets: [] },
    chartOptions: {},
    ...props,
  },
  global: { plugins: [PrimeVue] },
})

beforeEach(() => { chartRenders = [] })
afterEach(() => cleanup())

describe('MetaChartCard', () => {
  it('renders the chart it is given', () => {
    mountCard()
    expect(chartRenders.at(-1).data.labels).toEqual(['Barrington', 'East Greenwich'])
  })

  it('renders the matrix table below the chart', () => {
    mountCard()
    expect(screen.getByText('Village')).toBeInTheDocument()
    expect(screen.getByText('Barrington')).toBeInTheDocument()
  })

  it('sizes the chart box from row and series counts', () => {
    const { container } = mountCard()
    const box = container.querySelector('.chart-box')
    // 2 rows x 3 series x 14px + 64 = 148, floored at 240
    expect(box.getAttribute('style')).toContain('240px')
  })

  it('shows an empty message when there are no rows', () => {
    mountCard({ rows: [], chartData: { labels: [], datasets: [] } })
    expect(screen.getByText(/no requests in this range/i)).toBeInTheDocument()
  })

  it('re-emits the sort event raised by its table', async () => {
    const { emitted } = mountCard()
    await fireEvent.click(screen.getByRole('columnheader', { name: /unmatched/i }))
    expect(emitted()['update:sort']).toBeTruthy()
    expect(emitted()['update:sort'][0][0]).toMatchObject({ sort: 'unmatched' })
  })
})
