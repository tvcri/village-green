// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/vue'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import PrimeVue from 'primevue/config'
import MetricsRangePicker from './MetricsRangePicker.vue'

function mountPicker (props) {
  return render(MetricsRangePicker, {
    props: { today: '2026-07-13', ...props },
    global: { plugins: [PrimeVue] },
  })
}

describe('MetricsRangePicker', () => {
  beforeEach(() => {
    // jsdom implements neither; PrimeVue DatePicker uses both on mount.
    window.matchMedia = () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    })
    window.ResizeObserver = class {
      observe () {}
      unobserve () {}
      disconnect () {}
    }
  })

  // Unmount between tests so a prior render's DOM doesn't leak (dual-render trap).
  afterEach(() => cleanup())


  it('renders the five preset buttons', () => {
    mountPicker({ start: '2026-01-01', end: '2026-07-13' })
    // getByText throws if the element is absent, so a successful lookup is the assertion.
    expect(screen.getByText('This year')).toBeTruthy()
    expect(screen.getByText('Last year')).toBeTruthy()
    expect(screen.getByText('Last 90 days')).toBeTruthy()
    expect(screen.getByText('Last 30 days')).toBeTruthy()
    expect(screen.getByText('Custom')).toBeTruthy()
  })

  it('emits the computed range when a preset is clicked', async () => {
    const { emitted } = mountPicker({ start: '2026-01-01', end: '2026-07-13' })
    await fireEvent.click(screen.getByText('Last 30 days'))
    await waitFor(() => expect(emitted()['update:range']).toBeTruthy())
    const payload = emitted()['update:range'].at(-1)[0]
    expect(payload).toEqual({ start: '2026-06-14', end: '2026-07-13' })
  })
})
