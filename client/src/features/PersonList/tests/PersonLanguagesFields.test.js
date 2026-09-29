// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup } from '@testing-library/vue'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import PrimeVue from 'primevue/config'
import PersonLanguagesFields from '../components/PersonLanguagesFields.vue'

const languages = [
  { languageId: '1', name: 'English', tag: 'en' },
  { languageId: '2', name: 'Spanish', tag: 'es' },
]

beforeEach(() => {
  window.matchMedia = () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} })
})
afterEach(() => cleanup())

function mount (languageIds, preferredLanguageId) {
  const updates = { languageIds: [], preferredLanguageId: [] }
  render(PersonLanguagesFields, {
    props: {
      languages, languageIds, preferredLanguageId,
      'onUpdate:languageIds': v => updates.languageIds.push(v),
      'onUpdate:preferredLanguageId': v => updates.preferredLanguageId.push(v),
    },
    global: { plugins: [PrimeVue] },
  })
  return updates
}

const box = name => screen.getByText(name).closest('label').querySelector('input[type="checkbox"]')

describe('PersonLanguagesFields', () => {
  it('shows a Preferred radio only for spoken languages', () => {
    mount(['1'], null)
    expect(screen.getAllByText('Preferred')).toHaveLength(1)
  })

  it('ticking a language adds it without making it preferred', async () => {
    const updates = mount(['1'], null)
    await fireEvent.click(box('Spanish'))
    expect(updates.languageIds.at(-1)).toEqual(['1', '2'])
    expect(updates.preferredLanguageId).toEqual([])
  })

  it('unticking the preferred language clears the preference', async () => {
    const updates = mount(['1', '2'], '2')
    await fireEvent.click(box('Spanish'))
    expect(updates.languageIds.at(-1)).toEqual(['1'])
    expect(updates.preferredLanguageId.at(-1)).toBeNull()
  })

  it('choosing Preferred sets that language', async () => {
    const updates = mount(['1', '2'], '1')
    const radios = document.querySelectorAll('input[type="radio"]')
    await fireEvent.click(radios[1])
    expect(updates.preferredLanguageId.at(-1)).toBe('2')
  })
})
