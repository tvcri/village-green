// @vitest-environment jsdom
import { render, screen, cleanup } from '@testing-library/vue'
import { describe, it, expect, vi, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import PrimeVue from 'primevue/config'
import MetaVillage from '../components/MetaVillage.vue'

const granted = vi.hoisted(() => ({ has: () => true }))

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('../../../shared/composables/useCurrentUser.js', () => ({
  useCurrentUser: () => ({ hasPermission: (p) => granted.has(p) }),
}))
afterEach(() => {
  cleanup()
  granted.has = () => true
})

const renderHub = () => render(MetaVillage, { global: { plugins: [PrimeVue] } })

describe('Hub page', () => {
  it('is titled Hub and offers Trainings and Positions under Constituents', () => {
    renderHub()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Hub')
    expect(screen.getByText('Trainings')).toBeInTheDocument()
    expect(screen.getByText('Positions')).toBeInTheDocument()
    expect(screen.getByText(/record trainings and positions/)).toBeInTheDocument()
  })

  it('offers LGL sync under Integrations, not Constituents', () => {
    renderHub()
    const integrations = screen.getByRole('heading', { level: 2, name: 'Integrations' }).closest('section')
    expect(integrations).toHaveTextContent('LGL sync')
    const constituents = screen.getByRole('heading', { level: 2, name: 'Constituents' }).closest('section')
    expect(constituents).not.toHaveTextContent('LGL sync')
  })

  it('announces nothing that has not shipped', () => {
    renderHub()
    expect(screen.queryByText(/soon/i)).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Advocacy' })).toBeNull()
  })

  it('drops a card whose every button the user lacks permission for', () => {
    granted.has = (p) => p !== 'sync:read'
    renderHub()
    expect(screen.queryByRole('heading', { name: 'Integrations' })).toBeNull()
    expect(screen.queryByText('LGL sync')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Reporting' })).toBeInTheDocument()
  })
})
