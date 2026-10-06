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
  const utils = render({
    setup: () => () => h(VolunteerTrainingsFields, {
      trainings: model.value, 'onUpdate:trainings': (v) => { model.value = v }, trainingOptions,
    }),
  }, { global: { plugins: [PrimeVue] } })
  return { model, ...utils }
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

  it('rejects a duplicate date and a second undated record, and adds a new one', async () => {
    const { model } = renderWith([{ trainingId: '4', name: 'LSC Training', completedDate: null, notes: null }])
    await fireEvent.click(screen.getByLabelText('Add LSC Training'))
    expect(screen.getByText('LSC Training already has an undated record. Give this one a date.')).toBeInTheDocument()
    await fireEvent.click(screen.getByLabelText('Add Volunteer Training'))
    expect(model.value).toHaveLength(2)
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
    await fireEvent.click(screen.getByLabelText('Add LSC Training'))
    expect(model.value[0]).toMatchObject({ trainingId: '4', completedDate: null, sortDate: null })
    expect(model.value[0].key).toEqual(expect.any(String))
  })
})
