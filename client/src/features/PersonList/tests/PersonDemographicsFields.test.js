// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup } from '@testing-library/vue'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import PrimeVue from 'primevue/config'
import PersonDemographicsFields from '../components/PersonDemographicsFields.vue'

const lookups = {
  genders: [{ genderId: '1', name: 'Female' }, { genderId: '2', name: 'Male' }, { genderId: '3', name: 'Other' }],
  ethnicities: [{ ethnicityId: '1', name: 'Hispanic or Latino' }, { ethnicityId: '2', name: 'Not Hispanic or Latino' }],
  races: [{ raceId: '1', name: 'Asian' }, { raceId: '5', name: 'White' }],
}

beforeEach(() => {
  window.matchMedia = () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} })
})
afterEach(() => cleanup())

function mount (props = {}) {
  const updates = { raceIds: [] }
  render(PersonDemographicsFields, {
    props: {
      lookups, genderId: null, ethnicityId: null, isVeteran: null, raceIds: [],
      'onUpdate:raceIds': v => updates.raceIds.push(v),
      ...props,
    },
    global: { plugins: [PrimeVue], directives: { tooltip: {} } },
  })
  return updates
}

describe('PersonDemographicsFields', () => {
  it('shows an unknown veteran answer as Unknown, not No', () => {
    mount({ isVeteran: null })
    expect(screen.getByText('Unknown')).toBeInTheDocument()
  })

  it('shows a No veteran answer as No', () => {
    mount({ isVeteran: false })
    expect(screen.getByText('No')).toBeInTheDocument()
  })

  it('shows the selected gender name', () => {
    mount({ genderId: '1' })
    expect(screen.getByText('Female')).toBeInTheDocument()
  })

  it('toggles races as a set', async () => {
    const updates = mount({ raceIds: ['5'] })
    const asian = screen.getByText('Asian').closest('label').querySelector('input[type="checkbox"]')
    await fireEvent.click(asian)
    expect(updates.raceIds.at(-1)).toEqual(['5', '1'])
  })

  it('shows the warning icon for a flagged gender', () => {
    mount({ uncertain: { genderId: { reason: 'form said "F"; no matching option', alternative: null } } })
    expect(document.querySelector('.uncertain-icon')).not.toBeNull()
  })
})
