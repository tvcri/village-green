// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup } from '@testing-library/vue'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import PrimeVue from 'primevue/config'
import { h, ref } from 'vue'
import VolunteerTrainingsFields from '../components/VolunteerTrainingsFields.vue'

const trainingOptions = [{ trainingId: '1', name: 'Volunteer Training' }, { trainingId: '4', name: 'LSC Training' }]
beforeEach(() => {
  window.matchMedia = () => ({ matches: false, addEventListener () {}, removeEventListener () {} })
  globalThis.ResizeObserver = class { observe () {} unobserve () {} disconnect () {} }
})
afterEach(() => cleanup())

// A render function, not a template string: vitest's Vue build has no
// runtime template compiler.
function renderWith (initial) {
  const model = ref(initial)
  const adding = ref(false)
  const utils = render({
    setup: () => () => h(VolunteerTrainingsFields, {
      trainings: model.value, 'onUpdate:trainings': (v) => { model.value = v },
      adding: adding.value, 'onUpdate:adding': (v) => { adding.value = v },
      trainingOptions,
    }),
  }, { global: { plugins: [PrimeVue] } })
  return { model, adding, ...utils }
}

// PrimeVue Select: a click on the combobox opens the overlay, and an option
// is chosen on mousedown, not click.
async function pickTraining (name) {
  await fireEvent.click(screen.getByLabelText('New training'))
  await fireEvent.mouseDown(screen.getByRole('option', { name }))
}

describe('VolunteerTrainingsFields', () => {
  it('lists rows sorted by name then newest first, with undated shown as such', () => {
    renderWith([
      { trainingId: '1', name: 'Volunteer Training', completedDate: '2023-05-02', notes: null },
      { trainingId: '4', name: 'LSC Training', completedDate: null, notes: 'before records' },
      { trainingId: '1', name: 'Volunteer Training', completedDate: '2025-04-25', notes: 'email' },
    ])
    const names = screen.getAllByTestId('training-name').map(e => e.textContent.trim())
    expect(names).toEqual(['LSC Training', 'Volunteer Training', 'Volunteer Training'])
    expect(screen.getByDisplayValue('email')).toBeInTheDocument()
  })

  it('Add Training opens a pending row and reports adding; Cancel discards it', async () => {
    const { model, adding } = renderWith([])
    await fireEvent.click(screen.getByRole('button', { name: 'Add Training' }))
    expect(screen.getByLabelText('New training')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add Training' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Save new training' })).toBeDisabled()
    expect(adding.value).toBe(true)
    await fireEvent.click(screen.getByRole('button', { name: 'Cancel new training' }))
    expect(screen.queryByLabelText('New training')).toBeNull()
    expect(adding.value).toBe(false)
    expect(model.value).toEqual([])
  })

  it('rejects a second undated record, and adds a different training', async () => {
    const { model, adding } = renderWith([{ trainingId: '4', name: 'LSC Training', completedDate: null, notes: null }])
    await fireEvent.click(screen.getByRole('button', { name: 'Add Training' }))
    await pickTraining('LSC Training')
    await fireEvent.click(screen.getByRole('button', { name: 'Save new training' }))
    expect(screen.getByText('LSC Training already has an undated record. Give this one a date.')).toBeInTheDocument()
    expect(model.value).toHaveLength(1)
    expect(adding.value).toBe(true)
    await pickTraining('Volunteer Training')
    expect(screen.queryByText(/already has an undated record/)).toBeNull()
    await fireEvent.click(screen.getByRole('button', { name: 'Save new training' }))
    expect(model.value).toHaveLength(2)
    expect(adding.value).toBe(false)
  })

  it('carries the pending notes onto the added row', async () => {
    const { model } = renderWith([])
    await fireEvent.click(screen.getByRole('button', { name: 'Add Training' }))
    await pickTraining('LSC Training')
    await fireEvent.update(screen.getByLabelText('New training notes'), '  refresher  ')
    await fireEvent.click(screen.getByRole('button', { name: 'Save new training' }))
    expect(model.value[0]).toMatchObject({ trainingId: '4', name: 'LSC Training', notes: 'refresher' })
  })

  // Fix round 1: a DatePicker writes on every keystroke that parses, so the
  // row must not remount or move while its date is being typed.
  it('keeps a row mounted and in place while its date is edited', async () => {
    const { model } = renderWith([
      { key: 'vt1', sortDate: '2025-04-25', trainingId: '1', name: 'Volunteer Training', completedDate: '2025-04-25', notes: 'newer' },
      { key: 'vt2', sortDate: '2023-05-02', trainingId: '1', name: 'Volunteer Training', completedDate: '2023-05-02', notes: 'older' },
    ])
    const before = screen.getByDisplayValue('older').closest('tr')
    // As if the coordinator typed a date that would now sort first.
    model.value = [model.value[0], { ...model.value[1], completedDate: '2026-01-02' }]
    await new Promise(r => setTimeout(r))
    expect(screen.getByDisplayValue('older').closest('tr')).toBe(before)
    const notes = screen.getAllByRole('textbox').filter(e => e.getAttribute('aria-label') === 'Notes for Volunteer Training').map(e => e.value)
    expect(notes).toEqual(['newer', 'older'])
  })

  it('gives an added row a key and sort snapshot', async () => {
    const { model } = renderWith([])
    await fireEvent.click(screen.getByRole('button', { name: 'Add Training' }))
    await pickTraining('LSC Training')
    await fireEvent.click(screen.getByRole('button', { name: 'Save new training' }))
    expect(model.value[0]).toMatchObject({ trainingId: '4', completedDate: null, sortDate: null })
    expect(model.value[0].key).toEqual(expect.any(String))
  })
})
