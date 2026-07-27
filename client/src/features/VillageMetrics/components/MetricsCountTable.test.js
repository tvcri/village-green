// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/vue'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import PrimeVue from 'primevue/config'
import MetricsCountTable from './MetricsCountTable.vue'

const push = vi.fn()
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }))

const ROWS = [
  { personId: '11', fullName: 'Anderson, Alice', count: 5 },
  { personId: '22', fullName: 'Baker, Bob', count: 3 },
]

function mountTable (props) {
  return render(MetricsCountTable, {
    props: { rows: ROWS, nameHeader: 'Member', villageId: '42', linkRouteName: null, ...props },
    global: { plugins: [PrimeVue] },
  })
}

describe('MetricsCountTable', () => {
  beforeEach(() => {
    window.matchMedia = () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} })
  })

  afterEach(() => {
    cleanup()
  })

  it('renders rows with name and count', () => {
    mountTable({})
    expect(screen.getByText('Anderson, Alice')).toBeTruthy()
    expect(screen.getByText('5')).toBeTruthy()
  })

  it('shows empty text when rows is empty', () => {
    mountTable({ rows: [] })
    expect(screen.getByText('No completed requests in this range.')).toBeTruthy()
  })

  it('renders plain text (no navigation) when linkRouteName is null', async () => {
    mountTable({ linkRouteName: null })
    await fireEvent.click(screen.getByText('Anderson, Alice'))
    expect(push).not.toHaveBeenCalled()
  })

  // 5/3/12 rather than single digits so the assertion pins a real reordering
  // (an inert sort would leave 5, 3, 12). Note this cannot detect a stringified
  // count: PrimeVue compares strings with Intl.Collator({ numeric: true }),
  // which orders '3','5','12' correctly anyway.
  it('sorts by count when the Completed header is clicked', async () => {
    const { container } = mountTable({
      rows: [
        { personId: '11', fullName: 'Anderson, Alice', count: 5 },
        { personId: '22', fullName: 'Baker, Bob', count: 3 },
        { personId: '33', fullName: 'Carter, Cara', count: 12 },
      ],
    })

    await fireEvent.click(screen.getByText('Completed'))
    await waitFor(() => {
      const counts = [...container.querySelectorAll('tbody tr')].map(tr => tr.cells[1].textContent.trim())
      expect(counts).toEqual(['3', '5', '12'])
    })
  })

  it('sorts by name when the name header is clicked', async () => {
    const { container } = mountTable({
      rows: [
        { personId: '22', fullName: 'Baker, Bob', count: 3 },
        { personId: '11', fullName: 'Anderson, Alice', count: 5 },
      ],
    })

    await fireEvent.click(screen.getByText('Member'))
    await waitFor(() => {
      const names = [...container.querySelectorAll('tbody tr')].map(tr => tr.cells[0].textContent.trim())
      expect(names).toEqual(['Anderson, Alice', 'Baker, Bob'])
    })
  })

  it('navigates with villageId+personId when linkRouteName is set', async () => {
    push.mockClear()
    mountTable({ linkRouteName: 'member-detail' })
    await fireEvent.click(screen.getByText('Anderson, Alice'))
    await waitFor(() => expect(push).toHaveBeenCalledWith({
      name: 'member-detail',
      params: { villageId: '42', personId: '11' },
    }))
  })
})
