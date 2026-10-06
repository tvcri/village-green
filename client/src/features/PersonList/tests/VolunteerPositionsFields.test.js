// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup } from '@testing-library/vue'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import PrimeVue from 'primevue/config'
import { h, ref } from 'vue'
import VolunteerPositionsFields from '../components/VolunteerPositionsFields.vue'

const positionOptions = [
  { positionId: '3', name: 'Member Ambassador', scope: 'village', trainingIds: ['5'] },
  { positionId: '2', name: 'Board of Directors', scope: 'federation', trainingIds: [] },
]
const trainingOptions = [{ trainingId: '5', name: 'Ambassador Training' }]
const villageOptions = [{ villageId: '1', name: 'Barrington' }, { villageId: '7', name: 'Warwick' }, { villageId: '9', name: 'Westerly' }]
beforeEach(() => {
  window.matchMedia = () => ({ matches: false, addEventListener () {}, removeEventListener () {} })
  globalThis.ResizeObserver = class { observe () {} unobserve () {} disconnect () {} }
})
afterEach(() => cleanup())

function renderWith ({ positions, associates = ['7'], trainings = [] }) {
  const model = ref(positions)
  const assoc = ref(associates)
  const tr = ref(trainings)
  const utils = render({
    setup: () => () => h(VolunteerPositionsFields, {
      positions: model.value, 'onUpdate:positions': (v) => { model.value = v },
      positionOptions, homeVillage: { villageId: '1', name: 'Barrington' }, associateVillageIds: assoc.value,
      villageOptions, circleOptions: [], trainings: tr.value, trainingOptions,
    }),
  }, { global: { plugins: [PrimeVue] } })
  return { model, assoc, tr, ...utils }
}
const ma = { positionId: '3', name: 'Member Ambassador', scope: 'village', villageId: '7', villageName: 'Warwick', circleId: null, circleName: null }

describe('VolunteerPositionsFields', () => {
  it('shows the training hint and clears it when the training is added', async () => {
    const { tr } = renderWith({ positions: [ma] })
    expect(screen.getByText('No record of Ambassador Training')).toBeInTheDocument()
    tr.value = [{ trainingId: '5' }]
    await new Promise(r => setTimeout(r))
    expect(screen.queryByText('No record of Ambassador Training')).toBeNull()
  })

  it('marks a position whose associate village was removed, and restores it when re-added', async () => {
    const { assoc } = renderWith({ positions: [ma] })
    assoc.value = []
    await new Promise(r => setTimeout(r))
    expect(screen.getByText('Will be removed on save: Warwick is no longer one of this volunteer’s villages.')).toBeInTheDocument()
    assoc.value = ['7']
    await new Promise(r => setTimeout(r))
    expect(screen.queryByText(/Will be removed on save/)).toBeNull()
  })

  it('the village picker offers only home and associate villages', async () => {
    renderWith({ positions: [] })
    await fireEvent.click(screen.getByLabelText('Choose Member Ambassador'))
    const villageButtons = screen.getAllByTestId('where-option').map(b => b.textContent.trim())
    expect(villageButtons).toEqual(['Barrington', 'Warwick'])
  })

  it('a Hub position adds with no village', async () => {
    const { model } = renderWith({ positions: [] })
    await fireEvent.click(screen.getByLabelText('Choose Board of Directors'))
    await fireEvent.click(screen.getByText('Add Position'))
    expect(model.value[0]).toMatchObject({ positionId: '2', villageId: null, circleId: null })
  })
})
