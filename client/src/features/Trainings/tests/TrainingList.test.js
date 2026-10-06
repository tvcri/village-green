// @vitest-environment jsdom
import { render, screen, cleanup } from '@testing-library/vue'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import PrimeVue from 'primevue/config'
import TrainingList from '../components/TrainingList.vue'

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('../api/trainingApi.js', () => ({ getTrainings: vi.fn() }))
vi.mock('../../Positions/api/positionApi.js', () => ({ getPositions: vi.fn() }))
import { getTrainings } from '../api/trainingApi.js'
import { getPositions } from '../../Positions/api/positionApi.js'

beforeEach(() => {
  window.matchMedia = () => ({ matches: false, addEventListener () {}, removeEventListener () {} })
  globalThis.ResizeObserver = class { observe () {} unobserve () {} disconnect () {} }
  getPositions.mockResolvedValue([])
  getTrainings.mockResolvedValue([
    { trainingId: '1', name: 'A Training', description: '', holderCount: 2, lastCompletedDate: '2026-05-12' },
    { trainingId: '2', name: 'B Training', description: '', holderCount: 0, lastCompletedDate: null },
  ])
})
afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('TrainingList', () => {
  it('shows the last recorded date or a dash', async () => {
    render(TrainingList, { global: { plugins: [PrimeVue] } })
    expect(await screen.findByText('Last recorded')).toBeInTheDocument()
    expect(await screen.findByText('May 12, 2026')).toBeInTheDocument()
    expect(screen.getAllByText('—')).toHaveLength(3)
  })
})
