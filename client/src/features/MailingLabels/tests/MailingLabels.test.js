// @vitest-environment jsdom
import { render, cleanup, within, fireEvent, waitFor } from '@testing-library/vue'
import '@testing-library/jest-dom/vitest'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import PrimeVue from 'primevue/config'
import MailingLabels from '../components/MailingLabels.vue'
import { getMailingLabels } from '../api/mailingLabelApi.js'
import { generateLabelPdf } from '../lib/generateLabelPdf.js'

vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: vi.fn() }) }))
const perms = vi.hoisted(() => ({ denied: new Set() }))
vi.mock('../../../shared/composables/useCurrentUser.js', () => ({
  useCurrentUser: () => ({ hasPermission: (p) => !perms.denied.has(p) })
}))
vi.mock('../api/mailingLabelApi.js', () => ({ getMailingLabels: vi.fn() }))
vi.mock('../../VillageList/api/villageApi.js', () => ({
  getVillages: vi.fn().mockResolvedValue([{ villageId: 1, name: 'Testville' }])
}))
// pdf-lib is lazy and irrelevant here; the title option is what the page composes.
vi.mock('../lib/generateLabelPdf.js', () => ({
  generateLabelPdf: vi.fn().mockResolvedValue({ blob: new Blob(['x']), truncated: [] })
}))

const aLabel = { name: 'Test Person', sortLastName: 'Person', street: '1 Test St', city: 'Testville', state: 'RI', zip: '02800' }
const response = {
  labels: [aLabel],
  summary: { labelCount: 1, recipientCount: 1, mergedCount: 0 },
  warnings: { unmailable: [] }
}

// PrimeVue Select: click the combobox to open it; options are chosen on
// mousedown, not click.
// The page puts each label's id on the Select root, not the focusable
// combobox, so look the combobox up by that id.
const ids = { Audience: 'audience', Role: 'role', 'Last gift within': 'giftWindow', Village: 'village' }
const comboOrNull = (label) => document.querySelector(`#${ids[label]} [role="combobox"]`)
const combo = (label) => {
  const el = comboOrNull(label)
  if (!el) throw new Error(`No ${label} select`)
  return el
}
async function openSelect (label) { await fireEvent.click(combo(label)) }
// Scope to the list the combobox controls: other selects' closed overlays can linger in the DOM.
const listOf = (label) => document.getElementById(combo(label).getAttribute('aria-controls'))
const optionNames = (label) => [...listOf(label).querySelectorAll('.p-select-option')].map(o => o.getAttribute('aria-label'))
async function pick (label, option) {
  await openSelect(label)
  await fireEvent.mouseDown(within(listOf(label)).getByRole('option', { name: option }))
}
const lastCall = () => getMailingLabels.mock.calls.at(-1)[0]

async function renderPage () {
  render(MailingLabels, { global: { plugins: [PrimeVue] } })
}

describe('MailingLabels donor roles', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    perms.denied = new Set()
    window.matchMedia = () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} })
    window.ResizeObserver = class { observe () {} disconnect () {} }
    URL.createObjectURL = vi.fn(() => 'blob:test')
    URL.revokeObjectURL = vi.fn()
    // A fresh object per call, so each reload yields new label arrays and the PDF regenerates.
    getMailingLabels.mockImplementation(async () => structuredClone(response))
  })
  afterEach(cleanup)

  it('offers Donors and All on Full roster with donor:read', async () => {
    await renderPage()
    await pick('Audience', 'Full roster')
    await openSelect('Role')
    expect(optionNames('Role')).toEqual(['Active members', 'Active volunteers', 'Donors', 'All'])
  })

  it('Donors shows a window select defaulting to 5 years and sends it', async () => {
    await renderPage()
    await pick('Audience', 'Full roster')
    await pick('Role', 'Donors')
    await waitFor(() => expect(lastCall()).toMatchObject({ role: 'donor', lastGiftWithinYears: 5 }))
    expect(combo('Last gift within')).toHaveTextContent('5 years')
  })

  it('Any time sends no lastGiftWithinYears', async () => {
    await renderPage()
    await pick('Audience', 'Full roster')
    await pick('Role', 'Donors')
    await pick('Last gift within', 'Any time')
    await waitFor(() => expect(lastCall()).toMatchObject({ role: 'donor', lastGiftWithinYears: null }))
  })

  it('leaving Full roster resets a donor role to member and sends no window', async () => {
    await renderPage()
    await pick('Audience', 'Full roster')
    await pick('Role', 'Donors')
    await waitFor(() => expect(lastCall().role).toBe('donor'))
    await pick('Audience', 'Birthday month')
    await waitFor(() => expect(lastCall().audience).toBe('birthday-month'))
    for (const [args] of getMailingLabels.mock.calls.filter(([a]) => a.audience === 'birthday-month')) {
      expect(args.role).toBe('member')
      expect(args.lastGiftWithinYears ?? null).toBeNull()
    }
    expect(lastCall().month).not.toBeNull()
    expect(combo('Role')).toHaveTextContent('Active members')
    expect(comboOrNull('Last gift within')).toBeNull()
  })

  it('without donor:read keeps today\'s options and no window select', async () => {
    perms.denied = new Set(['donor:read'])
    await renderPage()
    await pick('Audience', 'Full roster')
    await openSelect('Role')
    expect(optionNames('Role')).toEqual(['Active members', 'Active volunteers', 'Either'])
    expect(comboOrNull('Last gift within')).toBeNull()
  })

  it('Either carries over as All when switching to Full roster with donor:read', async () => {
    await renderPage()
    await pick('Audience', 'Birthday month')
    await pick('Role', 'Either')
    await waitFor(() => expect(lastCall()).toMatchObject({ audience: 'birthday-month', role: 'either' }))
    await pick('Audience', 'Full roster')
    await waitFor(() => expect(lastCall()).toMatchObject({ audience: 'roster', role: 'all', lastGiftWithinYears: 5 }))
    expect(combo('Role')).toHaveTextContent('All')
  })

  it('without donor:read, Either survives switching to Full roster', async () => {
    perms.denied = new Set(['donor:read'])
    await renderPage()
    await pick('Audience', 'Birthday month')
    await pick('Role', 'Either')
    await pick('Audience', 'Full roster')
    await waitFor(() => expect(lastCall()).toMatchObject({ audience: 'roster', role: 'either' }))
    expect(combo('Role')).toHaveTextContent('Either')
  })

  it('Donors hides Village and sends no village; the choice returns for All', async () => {
    await renderPage()
    await pick('Audience', 'Full roster')
    await pick('Village', 'Testville')
    await waitFor(() => expect(lastCall()).toMatchObject({ role: 'member', villageId: 1 }))
    await pick('Role', 'Donors')
    await waitFor(() => expect(lastCall()).toMatchObject({ role: 'donor', villageId: null }))
    expect(comboOrNull('Village')).toBeNull()
    await pick('Role', 'All')
    await waitFor(() => expect(lastCall()).toMatchObject({ role: 'all', villageId: 1 }))
    expect(combo('Village')).toHaveTextContent('Testville')
  })

  it('titles All with the window', async () => {
    await renderPage()
    await pick('Audience', 'Full roster')
    await pick('Role', 'All')
    await waitFor(() => expect(generateLabelPdf).toHaveBeenCalled())
    const { title } = generateLabelPdf.mock.calls.at(-1)[1]
    expect(title).toContain('Active members, volunteers & donors')
    expect(title).toContain('gift within 5 years')
  })
})
