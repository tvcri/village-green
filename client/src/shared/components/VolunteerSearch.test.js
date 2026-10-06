// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup } from '@testing-library/vue'
import { describe, it, expect, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import PrimeVue from 'primevue/config'
import VolunteerSearch from './VolunteerSearch.vue'

const candidates = [
  { personId: '1', fullName: 'Abbott, Lorraine', displayName: 'Lorraine Abbott', village: { villageId: '1', name: 'Barrington' }, active: true },
  { personId: '2', fullName: 'Delgado, Marcus', displayName: 'Marcus Delgado', village: { villageId: '7', name: 'Warwick' }, active: true },
  { personId: '3', fullName: 'Quinn, Robert', displayName: 'Robert Quinn', village: null, active: false },
]
const opts = (props = {}) => ({ props: { candidates, ...props }, global: { plugins: [PrimeVue] } })

afterEach(() => cleanup())

describe('VolunteerSearch', () => {
  it('shows matches after two characters, with village and status', async () => {
    render(VolunteerSearch, opts())
    const input = screen.getByRole('combobox')
    await fireEvent.focus(input)
    await fireEvent.update(input, 'q')
    expect(screen.queryByRole('option')).toBeNull()
    await fireEvent.update(input, 'qu')
    expect(screen.getByText('Quinn, Robert')).toBeInTheDocument()
    expect(screen.getByText('Hub volunteer · Inactive')).toBeInTheDocument()
  })

  it('emits select on a click and clears the box', async () => {
    const { emitted } = render(VolunteerSearch, opts())
    const input = screen.getByRole('combobox')
    await fireEvent.focus(input)
    await fireEvent.update(input, 'abb')
    await fireEvent.mouseDown(screen.getByText('Abbott, Lorraine'))
    expect(emitted().select[0][0].personId).toBe('1')
    expect(input.value).toBe('')
  })

  it('shows a disabled match with its reason and never emits it; Enter picks the first enabled', async () => {
    const status = (p) => p.personId === '2' ? { disabled: true, reason: 'Home village is Warwick.' } : { disabled: false, reason: null }
    const { emitted } = render(VolunteerSearch, opts({ status }))
    const input = screen.getByRole('combobox')
    await fireEvent.focus(input)
    await fireEvent.update(input, 'del')
    expect(screen.getByText('Home village is Warwick.')).toBeInTheDocument()
    await fireEvent.mouseDown(screen.getByText('Delgado, Marcus'))
    expect(emitted().select).toBeUndefined()
    await fireEvent.update(input, 'r')
    await fireEvent.update(input, 'ro')
    await fireEvent.keyDown(input, { key: 'Enter' })
    expect(emitted().select[0][0].personId).toBe('3')
  })
})
