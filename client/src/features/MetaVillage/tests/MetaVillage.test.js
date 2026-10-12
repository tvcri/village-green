// @vitest-environment jsdom
import { render, screen, cleanup } from '@testing-library/vue'
import { describe, it, expect, vi, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import PrimeVue from 'primevue/config'
import MetaVillage from '../components/MetaVillage.vue'

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('../../../shared/composables/useCurrentUser.js', () => ({ useCurrentUser: () => ({ hasPermission: () => true }) }))
afterEach(() => cleanup())

describe('Hub page', () => {
  it('is titled Hub and offers Trainings and Positions under Constituents', () => {
    render(MetaVillage, { global: { plugins: [PrimeVue] } })
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Hub')
    expect(screen.getByText('Trainings')).toBeInTheDocument()
    expect(screen.getByText('Positions')).toBeInTheDocument()
    expect(screen.getByText(/record trainings and positions/)).toBeInTheDocument()
  })
})
