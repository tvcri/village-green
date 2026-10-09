// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup } from '@testing-library/vue'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import PrimeVue from 'primevue/config'
import { h, ref } from 'vue'
import VolunteerVettingsFields from '../components/VolunteerVettingsFields.vue'

const vettingTypeOptions = [{ vettingTypeId: '1', name: 'BCI' }, { vettingTypeId: '2', name: 'Driving record' }]
beforeEach(() => {
  window.matchMedia = () => ({ matches: false, addEventListener () {}, removeEventListener () {} })
  globalThis.ResizeObserver = class { observe () {} unobserve () {} disconnect () {} }
})
afterEach(() => cleanup())

function renderWith (initial) {
  const model = ref(initial)
  const adding = ref(false)
  const utils = render({
    setup: () => () => h(VolunteerVettingsFields, {
      vettings: model.value, 'onUpdate:vettings': (v) => { model.value = v },
      adding: adding.value, 'onUpdate:adding': (v) => { adding.value = v },
      vettingTypeOptions,
    }),
  }, { global: { plugins: [PrimeVue] } })
  return { model, adding, ...utils }
}

// PrimeVue Select: a click on the combobox opens the overlay, and an option
// is chosen on mousedown, not click.
async function pickType (name) {
  await fireEvent.click(screen.getByLabelText('New vetting type'))
  await fireEvent.mouseDown(screen.getByRole('option', { name }))
}

describe('VolunteerVettingsFields', () => {
  it('lists rows on record, or says there are none', () => {
    renderWith([{ key: 'vv0', vettingTypeId: '1', name: 'BCI', dateEntered: '2025-01-02', dateExpired: null }])
    expect(screen.getByTestId('vetting-name')).toHaveTextContent('BCI')
    cleanup()
    renderWith([])
    expect(screen.getByText('No vettings on record.')).toBeInTheDocument()
  })

  it('Add Vetting opens a pending row and reports adding; Cancel discards it', async () => {
    const { model, adding } = renderWith([])
    await fireEvent.click(screen.getByRole('button', { name: 'Add Vetting' }))
    expect(screen.getByLabelText('New vetting type')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add Vetting' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Save new vetting' })).toBeDisabled()
    expect(screen.queryByText('No vettings on record.')).toBeNull()
    expect(adding.value).toBe(true)
    await fireEvent.click(screen.getByRole('button', { name: 'Cancel new vetting' }))
    expect(screen.queryByLabelText('New vetting type')).toBeNull()
    expect(adding.value).toBe(false)
    expect(model.value).toEqual([])
  })

  it('refuses a duplicate type and date, and adds a different type with a key', async () => {
    const { model, adding } = renderWith([{ key: 'vv0', vettingTypeId: '1', name: 'BCI', dateEntered: null, dateExpired: null }])
    await fireEvent.click(screen.getByRole('button', { name: 'Add Vetting' }))
    await pickType('BCI')
    await fireEvent.click(screen.getByRole('button', { name: 'Save new vetting' }))
    expect(screen.getByText('This vetting type and date is already on the list.')).toBeInTheDocument()
    expect(model.value).toHaveLength(1)
    await pickType('Driving record')
    expect(screen.queryByText(/already on the list/)).toBeNull()
    await fireEvent.click(screen.getByRole('button', { name: 'Save new vetting' }))
    expect(model.value[1]).toMatchObject({ vettingTypeId: '2', name: 'Driving record', dateEntered: null, dateExpired: null })
    expect(model.value[1].key).toEqual(expect.any(String))
    expect(adding.value).toBe(false)
  })

  it('removes a row on record', async () => {
    const { model } = renderWith([{ key: 'vv0', vettingTypeId: '1', name: 'BCI', dateEntered: null, dateExpired: null }])
    await fireEvent.click(screen.getByRole('button', { name: 'Remove BCI' }))
    expect(model.value).toEqual([])
  })
})
