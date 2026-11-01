// @vitest-environment jsdom
import { render, screen, cleanup } from '@testing-library/vue'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { reactive, nextTick } from 'vue'
import PrimeVue from 'primevue/config'
import Breadcrumbs from '../Breadcrumbs.vue'
import { setCrumbPerson } from '../../shared/lib/crumbPerson.js'

const route = vi.hoisted(() => ({ current: null }))
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => route.current,
}))
vi.mock('../../shared/composables/useCurrentUser.js', async () => {
  const { ref } = await import('vue')
  return { useCurrentUser: () => ({ isGrantless: ref(false) }) }
})
vi.mock('../../features/VillageList/api/villageApi.js', () => ({ getVillages: vi.fn().mockResolvedValue([]) }))
vi.mock('../../features/Trainings/api/trainingApi.js', () => ({ getTrainings: vi.fn().mockResolvedValue([]) }))
vi.mock('../../features/Positions/api/positionApi.js', () => ({ getPositions: vi.fn().mockResolvedValue([]) }))
vi.mock('../../features/Admin/api/userGrantApi.js', () => ({ getUsers: vi.fn().mockResolvedValue([]) }))

function mount (name, params) {
  route.current = reactive({ name, params, query: {} })
  return render(Breadcrumbs, { global: { plugins: [PrimeVue] } })
}

const trail = () => [...document.querySelectorAll('.breadcrumb-list > :not(.breadcrumb-separator)')]
  .map(el => el.textContent.trim())
  .filter(Boolean)

beforeEach(() => {
  window.matchMedia = () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} })
  setCrumbPerson(null)
})

afterEach(() => cleanup())

describe('Breadcrumbs: Hub person pages', () => {
  // The bug: only the person list passes :personName, so every other way onto
  // these pages read "Person". The loaded person now names the crumb.
  it('names the person on the role forms from the loaded person', () => {
    setCrumbPerson({ personId: '5', fullName: 'Smith, Alice' })
    mount('meta-person-volunteer', { personId: '5' })
    expect(trail()).toEqual(['Villages', 'Hub', 'Persons', 'Smith, Alice', 'Volunteer'])
    cleanup()
    mount('meta-person-member', { personId: '5' })
    expect(trail()).toEqual(['Villages', 'Hub', 'Persons', 'Smith, Alice', 'Member'])
  })

  it('gives Edit Person a person crumb', () => {
    setCrumbPerson({ personId: '5', fullName: 'Smith, Alice' })
    mount('meta-person-edit', { personId: '5' })
    expect(trail()).toEqual(['Villages', 'Hub', 'Persons', 'Smith, Alice', 'Edit'])
  })

  it('names the person page without the :personName param', () => {
    setCrumbPerson({ personId: '5', fullName: 'Smith, Alice' })
    mount('meta-person-detail', { personId: '5' })
    expect(screen.getByText('Smith, Alice')).toHaveClass('breadcrumb-current')
  })

  // After a rename, Back returns to the list's URL with the old name in it.
  it('prefers the loaded name over the param', () => {
    setCrumbPerson({ personId: '5', fullName: 'Jones, Alice' })
    mount('meta-person-detail', { personId: '5', personName: 'Smith, Alice' })
    expect(trail()).toContain('Jones, Alice')
    expect(trail()).not.toContain('Smith, Alice')
  })

  it('uses the param until the person loads', async () => {
    mount('meta-person-detail', { personId: '5', personName: 'Smith, Alice' })
    expect(trail()).toContain('Smith, Alice')
    setCrumbPerson({ personId: '5', fullName: 'Jones, Alice' })
    await nextTick()
    expect(trail()).toContain('Jones, Alice')
  })

  it('ignores a loaded person from another page', () => {
    setCrumbPerson({ personId: '9', fullName: 'Other, Person' })
    mount('meta-person-volunteer', { personId: '5' })
    expect(trail()).toEqual(['Villages', 'Hub', 'Persons', 'Person', 'Volunteer'])
  })

  // setCrumbPerson gets the API row, whose id may not be a string.
  it('matches a numeric loaded personId to the string route param', () => {
    setCrumbPerson({ personId: 5, fullName: 'Smith, Alice' })
    mount('meta-person-member', { personId: '5' })
    expect(trail()).toContain('Smith, Alice')
  })
})
