// @vitest-environment jsdom
import { render, screen, cleanup } from '@testing-library/vue'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import PrimeVue from 'primevue/config'
import PersonFormFields from '../components/PersonFormFields.vue'

vi.mock('../api/personApi.js', () => ({ geocodeTown: vi.fn().mockResolvedValue({ town: null }) }))

const lookups = {
  genders: [{ genderId: '1', name: 'Female' }], ethnicities: [], races: [],
  contactMethods: [{ contactMethodId: '1', name: 'Phone' }],
  languages: [{ languageId: '1', name: 'English', tag: 'en' }],
}

beforeEach(() => {
  window.matchMedia = () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} })
})
afterEach(() => cleanup())

function mount (props = {}) {
  render(PersonFormFields, {
    props: {
      errors: {}, villages: [], circleNames: new Set(), disabilities: new Map(),
      lookups, lastName: 'Currie', ...props,
    },
    global: { plugins: [PrimeVue], directives: { tooltip: {} } },
  })
}

describe('PersonFormFields — 0027 fields', () => {
  it('renders the new Personal Information inputs', () => {
    mount()
    for (const id of ['suffix', 'pronouns', 'deceasedDate', 'preferredContactMethodId']) {
      expect(document.getElementById(id)).not.toBeNull()
    }
  })

  it('no longer marks First Name required', () => {
    mount()
    expect(screen.getByText('First Name').querySelector('.required')).toBeNull()
  })

  it('renders Demographics and Languages sections', () => {
    mount()
    expect(screen.getByText('Demographics')).toBeInTheDocument()
    expect(screen.getByText('Languages')).toBeInTheDocument()
  })

  it('hides Demographics without the permission but keeps Languages', () => {
    mount({ showDemographics: false })
    expect(screen.queryByText('Demographics')).toBeNull()
    expect(screen.getByText('Languages')).toBeInTheDocument()
  })
})
