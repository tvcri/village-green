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

  it('shows languages as a Personal Information subgroup', () => {
    mount({ ...base, languages: [
      { languageId: '1', name: 'English', tag: 'en', isPreferred: true },
    ] })
    const heading = screen.getByText('Languages')
    expect(heading.classList.contains('subsection-header')).toBe(true)
    expect(heading.closest('.section').querySelector('.section-header').textContent.trim()).toBe('Personal Information')
  })

  it('omits the Languages subgroup when the person has none', () => {
    mount({ ...base, languages: [] })
    expect(screen.queryByText('Languages')).toBeNull()
  })

  it('shows Demographics with an explicit No veteran answer', () => {
    mount({ ...base, gender: { genderId: '1', name: 'Female' }, races: [{ raceId: '1', name: 'Asian' }, { raceId: '5', name: 'White' }], isVeteran: false })
    expect(screen.getByText('Demographics')).toBeInTheDocument()
    expect(screen.getByText('Asian, White')).toBeInTheDocument()
    expect(screen.getByText('Veteran').nextElementSibling.textContent).toBe('No')
  })

  it('hides an unknown veteran answer and the whole section when nothing is present', () => {
    mount({ ...base, isVeteran: null, races: [] })
    expect(screen.queryByText('Demographics')).toBeNull()
  })

  it('shows circle service preferences in Member Information', () => {
    mount({ ...base, circlePreferences: [{ circleId: '1', name: 'Circle of Pride' }] })
    expect(screen.getByText('Circle of Pride')).toBeInTheDocument()
    expect(screen.getByText('Prefers a volunteer from')).toBeInTheDocument()
  })

  it('shows disabilities with their notes', () => {
    mount({ ...base, disabilities: [
      { disabilityId: '3', name: 'Hearing', note: 'Slight' },
      { disabilityId: '1', name: 'Vision', note: null },
    ] })
    expect(screen.getByText('Disabilities')).toBeInTheDocument()
    expect(screen.getByText('Hearing').closest('li').textContent).toContain('Slight')
    expect(screen.getByText('Vision')).toBeInTheDocument()
  })

  it('titles the card with the whole name, middle initial included', () => {
    mount({ ...base, middleInitial: 'A' })
    expect(document.querySelector('.title-name span').textContent).toBe('Currie, Robert A., Jr.')
    cleanup()
    mount({ ...base, firstName: null, suffix: null })
    expect(document.querySelector('.title-name span').textContent).toBe('Currie')
  })

  it('puts nickname and pronouns under the name, and nothing when neither is set', () => {
    mount({ ...base, nickname: 'Bob', pronouns: 'he/him' })
    expect(document.querySelector('.title-aside').textContent).toBe('\u201cBob\u201d \u00b7 he/him')
    cleanup()
    mount(base)
    expect(document.querySelector('.title-aside')).toBeNull()
  })

  it('shows circles as tags beside the village', () => {
    mount({ ...base, village: { villageId: '1', name: 'Providence' }, circles: [{ circleId: '2', name: 'OakHill' }] })
    const tags = [...document.querySelectorAll('.title-tags .p-tag')].map(t => t.textContent.trim())
    expect(tags).toEqual(['Providence', 'OakHill'])
  })
})

describe('PersonDetailCard — household links', () => {
  it('lists secondary members with their relationship on the primary', () => {
    mount({ ...base, secondaryPersons: [
      { personId: '6', fullName: 'Currie, Ann', secondaryType: 'Wife' },
      { personId: '7', fullName: 'Currie, Sam', secondaryType: null },
    ] })
    expect(screen.getByText('Secondary Members')).toBeInTheDocument()
    expect(screen.getByText('Currie, Ann (Wife); Currie, Sam')).toBeInTheDocument()
  })

  it('uses the singular label for one secondary and omits the field for none', () => {
    mount({ ...base, secondaryPersons: [{ personId: '6', fullName: 'Currie, Ann', secondaryType: 'Wife' }] })
    expect(screen.getByText('Secondary Member')).toBeInTheDocument()
    cleanup()
    mount({ ...base, secondaryPersons: [] })
    expect(screen.queryByText(/Secondary Member/)).toBeNull()
  })
})
