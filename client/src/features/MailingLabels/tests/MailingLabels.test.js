// @vitest-environment jsdom
import { render, cleanup, within, fireEvent, waitFor, screen } from '@testing-library/vue'
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
const ids = { Audience: 'audience', 'Last gift within': 'giftWindow', Village: 'village', Month: 'month' }
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
const roleGroup = () => document.querySelector('[role="group"][aria-label="Role"]')
const box = (name) => {
  const group = roleGroup()
  const label = group && [...group.querySelectorAll('label')].find(l => l.textContent.trim() === name)
  return label ? label.querySelector('input[type="checkbox"]') : null
}
async function toggle (name) {
  const el = box(name)
  if (!el) throw new Error(`No ${name} checkbox`)
  await fireEvent.click(el)
}
// The visible control labels, top to bottom.
const fieldOrder = () => [...document.querySelectorAll('.controls .field > label, .controls .field > .field-label')]
  .map(e => e.textContent.trim())
const lastCall = () => getMailingLabels.mock.calls.at(-1)[0]

async function renderPage () {
  render(MailingLabels, { global: { plugins: [PrimeVue] } })
}

describe('MailingLabels roles', () => {
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

  const lastTitle = () => generateLabelPdf.mock.calls.at(-1)[1].title

  it('orders Full roster controls Audience, Village, Role, Last gift within', async () => {
    await renderPage()
    await pick('Audience', 'Full roster')
    await toggle('Donors')
    expect(fieldOrder()).toEqual(['Audience', 'Village', 'Role', 'Last gift within'])
  })

  it('orders Birthday month controls Audience, Month, Village, Role', async () => {
    await renderPage()
    await pick('Audience', 'Birthday month')
    expect(fieldOrder()).toEqual(['Audience', 'Month', 'Village', 'Role'])
  })

  it('names the members-only audiences', async () => {
    await renderPage()
    await openSelect('Audience')
    expect(optionNames('Audience')).toEqual(['Printed newsletter (members)', 'Birthday month', 'Join month (members)', 'Full roster'])
  })

  it('opens with Members checked and sends it alone', async () => {
    await renderPage()
    await pick('Audience', 'Full roster')
    expect(box('Members')).toBeChecked()
    expect(box('Volunteers')).not.toBeChecked()
    expect(box('Donors')).not.toBeChecked()
    await waitFor(() => expect(lastCall()).toMatchObject({ role: ['member'], lastGiftWithinYears: null }))
  })

  it('Members + Volunteers across all villages, with no donors and no window', async () => {
    await renderPage()
    await pick('Audience', 'Full roster')
    await toggle('Volunteers')
    await waitFor(() => expect(lastCall()).toMatchObject({ role: ['member', 'volunteer'], villageId: null, lastGiftWithinYears: null }))
    expect(combo('Village')).toHaveTextContent('All villages')
    expect(comboOrNull('Last gift within')).toBeNull()
  })

  it('Donors shows the window, defaulting to 5 years, and sends it', async () => {
    await renderPage()
    await pick('Audience', 'Full roster')
    await toggle('Donors')
    await waitFor(() => expect(lastCall()).toMatchObject({ role: ['member', 'donor'], lastGiftWithinYears: 5 }))
    expect(combo('Last gift within')).toHaveTextContent('5 years')
  })

  it('Any time sends no window and keeps donors', async () => {
    await renderPage()
    await pick('Audience', 'Full roster')
    await toggle('Donors')
    await pick('Last gift within', 'Any time')
    await waitFor(() => expect(lastCall()).toMatchObject({ role: ['member', 'donor'], lastGiftWithinYears: null }))
  })

  it('a village with Donors keeps donors and shows the note', async () => {
    await renderPage()
    await pick('Audience', 'Full roster')
    await toggle('Donors')
    await pick('Village', 'Testville')
    await waitFor(() => expect(lastCall()).toMatchObject({ role: ['member', 'donor'], villageId: 1, lastGiftWithinYears: 5 }))
    expect(screen.getByTestId('village-donor-note')).toHaveTextContent("Donors with no village aren't included when a village is chosen.")
  })

  it('a village without Donors shows no note', async () => {
    await renderPage()
    await pick('Audience', 'Full roster')
    await pick('Village', 'Testville')
    await waitFor(() => expect(lastCall()).toMatchObject({ role: ['member'], villageId: 1 }))
    expect(screen.queryByTestId('village-donor-note')).toBeNull()
  })

  it('nothing checked prompts for a role and makes no request', async () => {
    await renderPage()
    await pick('Audience', 'Full roster')
    await waitFor(() => expect(generateLabelPdf).toHaveBeenCalled())
    const calls = getMailingLabels.mock.calls.length
    const pdfs = generateLabelPdf.mock.calls.length
    await toggle('Members')
    expect(await screen.findByText('Choose at least one role to generate labels.')).toBeInTheDocument()
    expect(getMailingLabels.mock.calls.length).toBe(calls)
    expect(generateLabelPdf.mock.calls.length).toBe(pdfs)
    expect(screen.queryByText(/labels \(/)).toBeNull()
  })

  it('unchecking the last role while a request is in flight shows no stale labels', async () => {
    let resolvePending
    await renderPage()
    getMailingLabels.mockImplementationOnce(() => new Promise(r => { resolvePending = r }))
    await pick('Audience', 'Full roster')
    await waitFor(() => expect(resolvePending).toBeTypeOf('function'))
    await toggle('Members')
    expect(await screen.findByText('Choose at least one role to generate labels.')).toBeInTheDocument()
    resolvePending(structuredClone(response))
    await new Promise(r => setTimeout(r, 50))
    expect(screen.queryByText(/labels \(/)).toBeNull()
    expect(screen.queryByText('Loading…')).toBeNull()
    // The late response can start a PDF build, but the page's generation
    // counter discards it once the labels clear: no preview is left showing.
    expect(document.querySelector('iframe.preview')).toBeNull()
    expect(screen.getByText('The PDF preview appears here.')).toBeInTheDocument()
  })

  it('Donors alone, then Birthday month, prompts for a role rather than sending members', async () => {
    await renderPage()
    await pick('Audience', 'Full roster')
    await toggle('Donors')
    await toggle('Members')
    await waitFor(() => expect(lastCall()).toMatchObject({ role: ['donor'] }))
    await pick('Audience', 'Birthday month')
    expect(box('Donors')).toBeNull()
    expect(await screen.findByText('Choose at least one role to generate labels.')).toBeInTheDocument()
    expect(getMailingLabels.mock.calls.some(([a]) => a.audience === 'birthday-month')).toBe(false)
  })

  it('remembers a hidden Donors box across an audience detour', async () => {
    await renderPage()
    await pick('Audience', 'Full roster')
    await toggle('Donors')
    await pick('Audience', 'Birthday month')
    await waitFor(() => expect(lastCall().audience).toBe('birthday-month'))
    await pick('Audience', 'Full roster')
    expect(box('Donors')).toBeChecked()
    await waitFor(() => expect(lastCall()).toMatchObject({ audience: 'roster', role: ['member', 'donor'], lastGiftWithinYears: 5 }))
  })

  it('Birthday month never sends donor or a window', async () => {
    await renderPage()
    await pick('Audience', 'Full roster')
    await toggle('Donors')
    await pick('Audience', 'Birthday month')
    await waitFor(() => expect(lastCall().audience).toBe('birthday-month'))
    for (const [args] of getMailingLabels.mock.calls.filter(([a]) => a.audience === 'birthday-month')) {
      expect(args.role).toEqual(['member'])
      expect(args.lastGiftWithinYears ?? null).toBeNull()
    }
    expect(box('Volunteers')).not.toBeNull()
    expect(comboOrNull('Last gift within')).toBeNull()
  })

  it('a members-only audience sends member even when Members was unchecked', async () => {
    await renderPage()
    await pick('Audience', 'Full roster')
    await toggle('Volunteers')
    await toggle('Members')
    await pick('Audience', 'Printed newsletter (members)')
    expect(roleGroup()).toBeNull()
    await waitFor(() => expect(lastCall()).toMatchObject({ audience: 'printed-newsletter', role: ['member'] }))
  })

  it('without donor:read there is no Donors box, no window, and donor is never sent', async () => {
    perms.denied = new Set(['donor:read'])
    await renderPage()
    await pick('Audience', 'Full roster')
    await toggle('Volunteers')
    await waitFor(() => expect(lastCall()).toMatchObject({ role: ['member', 'volunteer'] }))
    expect(box('Donors')).toBeNull()
    expect(comboOrNull('Last gift within')).toBeNull()
    for (const [args] of getMailingLabels.mock.calls) expect(args.role).not.toContain('donor')
  })

  it('titles all three with the window and the village', async () => {
    await renderPage()
    await pick('Audience', 'Full roster')
    await toggle('Volunteers')
    await toggle('Donors')
    await pick('Village', 'Testville')
    await waitFor(() => expect(lastCall()).toMatchObject({ villageId: 1 }))
    await waitFor(() => expect(lastTitle()).toBe('Full roster - Active members, volunteers & donors (gift within 5 years) - Testville'))
  })

  it('titles volunteers and donors', async () => {
    await renderPage()
    await pick('Audience', 'Full roster')
    await toggle('Members')
    await toggle('Volunteers')
    await toggle('Donors')
    await waitFor(() => expect(lastCall()).toMatchObject({ role: ['volunteer', 'donor'] }))
    await waitFor(() => expect(lastTitle()).toContain('Active volunteers & donors'))
  })
})
