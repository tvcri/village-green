// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup } from '@testing-library/vue'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { h } from 'vue'
import PrimeVue from 'primevue/config'
import TableFooter from '../TableFooter.vue'

function slotProps (overrides = {}) {
  return {
    first: 11,
    last: 20,
    rows: 10,
    page: 1,
    pageCount: 3,
    pageLinks: [1, 2, 3],
    totalRecords: 25,
    firstPageCallback: vi.fn(),
    lastPageCallback: vi.fn(),
    prevPageCallback: vi.fn(),
    nextPageCallback: vi.fn(),
    rowChangeCallback: vi.fn(),
    changePageCallback: vi.fn(),
    ...overrides
  }
}

function mount (props, slots = {}) {
  return render(TableFooter, {
    props: { modelValue: 10, ...props },
    slots,
    global: { plugins: [PrimeVue], directives: { tooltip: {} } }
  })
}

describe('TableFooter', () => {
  beforeEach(() => {
    window.matchMedia = () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} })
    window.ResizeObserver = class { observe () {} unobserve () {} disconnect () {} }
  })
  afterEach(() => cleanup())

  it('renders the first–last of total count', () => {
    mount(slotProps())
    expect(screen.getByText('11–20 of 25')).toBeInTheDocument()
  })

  it('calls the matching PrimeVue callback for each button', async () => {
    const p = slotProps()
    mount(p)
    await fireEvent.click(screen.getByRole('button', { name: 'First page' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Previous page' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Last page' }))
    expect(p.firstPageCallback).toHaveBeenCalledTimes(1)
    expect(p.prevPageCallback).toHaveBeenCalledTimes(1)
    expect(p.nextPageCallback).toHaveBeenCalledTimes(1)
    expect(p.lastPageCallback).toHaveBeenCalledTimes(1)
  })

  it('enables all four buttons on a middle page', () => {
    mount(slotProps())
    for (const name of ['First page', 'Previous page', 'Next page', 'Last page']) {
      expect(screen.getByRole('button', { name })).toBeEnabled()
    }
  })

  it('disables first and previous on page 0', () => {
    mount(slotProps({ page: 0, first: 1, last: 10 }))
    expect(screen.getByRole('button', { name: 'First page' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next page' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Last page' })).toBeEnabled()
  })

  it('disables next and last on the final page', () => {
    mount(slotProps({ page: 2, first: 21, last: 25 }))
    expect(screen.getByRole('button', { name: 'First page' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Last page' })).toBeDisabled()
  })

  it('disables all four buttons when there are no records', () => {
    mount(slotProps({ page: 0, pageCount: 0, totalRecords: 0, first: 1, last: 0 }))
    for (const name of ['First page', 'Previous page', 'Next page', 'Last page']) {
      expect(screen.getByRole('button', { name })).toBeDisabled()
    }
  })

  it('renders the default slot', () => {
    mount(slotProps(), { default: () => h('button', { type: 'button' }, 'Slot content') })
    expect(screen.getByRole('button', { name: 'Slot content' })).toBeInTheDocument()
  })

  it('keeps the global paginator classes and does not leak slot props as attributes', () => {
    const { container } = mount(slotProps())
    const root = container.querySelector('.paginator-container')
    expect(root).not.toBeNull()
    expect(root.querySelector('.paginator-info')).not.toBeNull()
    expect(root.hasAttribute('rows')).toBe(false)
    expect(root.hasAttribute('pagelinks')).toBe(false)
  })

  it('renders the page-size select with the current value', () => {
    mount({ ...slotProps(), modelValue: 25 })
    expect(screen.getByRole('combobox')).toHaveAccessibleName('Rows per page')
    expect(screen.getByText('25')).toBeInTheDocument()
  })
})
