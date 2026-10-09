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
  { positionId: '4', name: 'Finance Committee', scope: 'federation', trainingIds: [] },
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
  const adding = ref(false)
  const assoc = ref(associates)
  const tr = ref(trainings)
  const utils = render({
    setup: () => () => h(VolunteerPositionsFields, {
      positions: model.value, 'onUpdate:positions': (v) => { model.value = v },
      adding: adding.value, 'onUpdate:adding': (v) => { adding.value = v },
      positionOptions, homeVillage: { villageId: '1', name: 'Barrington' }, associateVillageIds: assoc.value,
      villageOptions, circleOptions: [], trainings: tr.value, trainingOptions,
    }),
  }, { global: { plugins: [PrimeVue] } })
  return { model, adding, assoc, tr, ...utils }
}
const ma = (villageId, villageName) => ({ positionId: '3', name: 'Member Ambassador', scope: 'village', villageId, villageName, circleId: null, circleName: null })
const bod = { positionId: '2', name: 'Board of Directors', scope: 'federation', villageId: null, villageName: null, circleId: null, circleName: null }

// PrimeVue Select: a click on the combobox opens the overlay; options render
// with role="option" and their label as aria-label, and one is chosen on
// mousedown, not click.
async function openSelect (label) { await fireEvent.click(screen.getByLabelText(label)) }
// Options of the list a combobox controls; group headers also carry
// role="option", so only .p-select-option rows count.
const optionNames = (label) => [...document.getElementById(screen.getByLabelText(label).getAttribute('aria-controls'))
  .querySelectorAll('.p-select-option')].map(o => o.getAttribute('aria-label'))
async function pick (label, option) {
  await openSelect(label)
  await fireEvent.mouseDown(screen.getByRole('option', { name: option }))
}

describe('VolunteerPositionsFields', () => {
  it('shows the training hint and clears it when the training is added', async () => {
    const { tr } = renderWith({ positions: [ma('7', 'Warwick')] })
    expect(screen.getByText('No record of Ambassador Training')).toBeInTheDocument()
    tr.value = [{ trainingId: '5' }]
    await new Promise(r => setTimeout(r))
    expect(screen.queryByText('No record of Ambassador Training')).toBeNull()
  })

  it('marks a position whose associate village was removed, and restores it when re-added', async () => {
    const { assoc } = renderWith({ positions: [ma('7', 'Warwick')] })
    assoc.value = []
    await new Promise(r => setTimeout(r))
    expect(screen.getByText('Will be removed on save: Warwick is no longer one of this volunteer’s villages.')).toBeInTheDocument()
    assoc.value = ['7']
    await new Promise(r => setTimeout(r))
    expect(screen.queryByText(/Will be removed on save/)).toBeNull()
  })

  it('Add Position opens a pending row and reports adding; Cancel discards it', async () => {
    const { model, adding } = renderWith({ positions: [] })
    expect(screen.queryByLabelText('New position')).toBeNull()
    await fireEvent.click(screen.getByRole('button', { name: 'Add Position' }))
    expect(screen.getByLabelText('New position')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add Position' })).toBeDisabled()
    expect(adding.value).toBe(true)
    await fireEvent.click(screen.getByRole('button', { name: 'Cancel new position' }))
    expect(screen.queryByLabelText('New position')).toBeNull()
    expect(adding.value).toBe(false)
    expect(model.value).toEqual([])
  })

  it('the village choice offers home and associate villages, minus ones already held', async () => {
    renderWith({ positions: [ma('7', 'Warwick')] })
    await fireEvent.click(screen.getByRole('button', { name: 'Add Position' }))
    expect(screen.getByLabelText('Village')).toHaveAttribute('aria-disabled', 'true')
    await pick('New position', 'Member Ambassador')
    await openSelect('Village')
    expect(optionNames('Village')).toEqual(['Barrington (home)'])
  })

  it('leaves out a Hub position already held and a village position held everywhere', async () => {
    renderWith({ positions: [bod, ma('1', 'Barrington'), ma('7', 'Warwick')] })
    await fireEvent.click(screen.getByRole('button', { name: 'Add Position' }))
    await openSelect('New position')
    expect(optionNames('New position')).toEqual(['Finance Committee'])
  })

  it('the position list has a search box that matches anywhere in the name', async () => {
    renderWith({ positions: [] })
    await fireEvent.click(screen.getByRole('button', { name: 'Add Position' }))
    await openSelect('New position')
    await fireEvent.update(screen.getByPlaceholderText('Type to find a position'), 'mitt')
    expect(optionNames('New position')).toEqual(['Finance Committee'])
  })

  it('a Hub position needs no village and adds with none', async () => {
    const { model, adding } = renderWith({ positions: [] })
    await fireEvent.click(screen.getByRole('button', { name: 'Add Position' }))
    const ok = screen.getByRole('button', { name: 'Save new position' })
    expect(ok).toBeDisabled()
    await pick('New position', 'Board of Directors')
    expect(screen.queryByLabelText('Village')).toBeNull()
    await fireEvent.click(ok)
    expect(model.value).toEqual([expect.objectContaining({ positionId: '2', villageId: null, circleId: null })])
    expect(adding.value).toBe(false)
  })

  it('a village position adds once its village is chosen, with the hint shown while adding', async () => {
    const { model } = renderWith({ positions: [] })
    await fireEvent.click(screen.getByRole('button', { name: 'Add Position' }))
    await pick('New position', 'Member Ambassador')
    expect(screen.getByText('No record of Ambassador Training')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save new position' })).toBeDisabled()
    await pick('Village', 'Warwick (associate)')
    await fireEvent.click(screen.getByRole('button', { name: 'Save new position' }))
    expect(model.value).toEqual([expect.objectContaining({ positionId: '3', villageId: '7', villageName: 'Warwick' })])
  })
})
