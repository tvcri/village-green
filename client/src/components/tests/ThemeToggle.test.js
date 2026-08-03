// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup } from '@testing-library/vue'
import { describe, it, expect, vi, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import PrimeVue from 'primevue/config'
import Tooltip from 'primevue/tooltip'
import ThemeToggle from '../ThemeToggle.vue'

// useTheme.js calls window.matchMedia at module scope, so the stub must be
// in place before the component import is evaluated. localStorage needs a
// stub too: Node 24 defines an experimental global localStorage that is
// undefined without --localstorage-file and shadows jsdom's.
vi.hoisted(() => {
  window.matchMedia = () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  })
  const store = new Map()
  const localStorageStub = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  }
  Object.defineProperty(window, 'localStorage', { value: localStorageStub, configurable: true })
  Object.defineProperty(globalThis, 'localStorage', { value: localStorageStub, configurable: true })
})

function mount () {
  return render(ThemeToggle, {
    global: {
      plugins: [PrimeVue],
      directives: { tooltip: Tooltip },
    },
  })
}

describe('ThemeToggle', () => {
  afterEach(() => cleanup())

  it('selecting a mode from the menu applies the theme AND updates the trigger icon', async () => {
    window.localStorage.setItem('vg-theme', 'light')
    mount()

    const trigger = screen.getByRole('button', { name: /^Theme: Light/ })
    expect(document.documentElement.classList.contains('app-dark')).toBe(false)

    await fireEvent.click(trigger)
    await fireEvent.click(await screen.findByText('Dark'))

    // The regression this guards: mode writes applied the theme but consumers
    // never re-rendered, so the trigger froze on the old mode.
    expect(document.documentElement.classList.contains('app-dark')).toBe(true)
    expect(screen.getByRole('button', { name: /^Theme: Dark/ })).toBeInTheDocument()

    await fireEvent.click(screen.getByRole('button', { name: /^Theme: Dark/ }))
    await fireEvent.click(await screen.findByText('Browser'))

    // Stubbed OS preference is light, so Browser mode resolves to light.
    expect(document.documentElement.classList.contains('app-dark')).toBe(false)
    expect(screen.getByRole('button', { name: /^Theme: Browser/ })).toBeInTheDocument()
    expect(window.localStorage.getItem('vg-theme')).toBe('system')
  })
})
