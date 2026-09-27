// @vitest-environment jsdom
import { render, screen, cleanup } from '@testing-library/vue'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import PrimeVue from 'primevue/config'
import PersonDetailCard from './PersonDetailCard.vue'

vi.mock('../../components/PersonMap.vue', () => ({ default: { template: '<div />' } }))

beforeEach(() => {
  window.matchMedia = () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} })
  // The card reads its map toggle from localStorage on setup; this jsdom has none.
  const store = new Map()
  vi.stubGlobal('localStorage', { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) })
})
afterEach(() => cleanup())

const base = { personId: '5', fullName: 'Currie, Robert, Jr.', lastName: 'Currie', firstName: 'Robert', suffix: 'Jr.' }

function mount (person, personType = 'member') {
  render(PersonDetailCard, { props: { person, personType }, global: { plugins: [PrimeVue] } })
}

describe('PersonDetailCard — 0027 fields', () => {
  it('shows a Deceased tag only when deceasedDate is set', () => {
    mount({ ...base, deceasedDate: '2026-08-01' })
    expect(screen.getByText('Deceased')).toBeInTheDocument()
    expect(screen.getByText('2026-08-01')).toBeInTheDocument()
    cleanup()
    mount(base)
    expect(screen.queryByText('Deceased')).toBeNull()
  })

  it('lists languages with the preferred one marked', () => {
    mount({ ...base, languages: [
      { languageId: '1', name: 'English', tag: 'en', isPreferred: true },
      { languageId: '2', name: 'Spanish', tag: 'es', isPreferred: false },
    ] })
    expect(screen.getByText('English (preferred), Spanish')).toBeInTheDocument()
  })

  it('shows languages in their own section after Demographics', () => {
    mount({ ...base, gender: { genderId: '1', name: 'Female' }, languages: [
      { languageId: '1', name: 'English', tag: 'en', isPreferred: true },
    ] })
    const headers = [...document.querySelectorAll('.section-header')].map(h => h.textContent.trim())
    expect(headers.indexOf('Languages')).toBe(headers.indexOf('Demographics') + 1)
  })

  it('omits the Languages section when the person has none', () => {
    mount({ ...base, languages: [] })
    expect(screen.queryByText('Languages')).toBeNull()
  })

  it('shows Demographics with an explicit No veteran answer', () => {
    mount({ ...base, gender: { genderId: '1', name: 'Female' }, races: [{ raceId: '1', name: 'Asian' }, { raceId: '5', name: 'White' }], isVeteran: false })
    expect(screen.getByText('Demographics')).toBeInTheDocument()
    expect(screen.getByText('Asian, White')).toBeInTheDocument()
    expect(screen.getByText('Veteran:').nextElementSibling.textContent).toBe('No')
  })

  it('hides an unknown veteran answer and the whole section when nothing is present', () => {
    mount({ ...base, isVeteran: null, races: [] })
    expect(screen.queryByText('Demographics')).toBeNull()
  })

  it('shows circle service preferences in Member Information', () => {
    mount({ ...base, circlePreferences: [{ circleId: '1', name: 'Circle of Pride' }] })
    expect(screen.getByText('Circle of Pride')).toBeInTheDocument()
    expect(screen.getByText('Prefers a volunteer from:')).toBeInTheDocument()
  })
})
