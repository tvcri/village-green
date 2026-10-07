// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/vue'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import PrimeVue from 'primevue/config'
import TrainingDetail from '../components/TrainingDetail.vue'

const granted = new Set()
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { trainingId: '4' } }),
  useRouter: () => ({ push: vi.fn() }),
  onBeforeRouteLeave: vi.fn(),
}))
vi.mock('primevue/useconfirm', () => ({ useConfirm: () => ({ require: vi.fn() }) }))
vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: vi.fn() }) }))
vi.mock('../../../shared/composables/useCurrentUser.js', () => ({
  useCurrentUser: () => ({ hasPermission: (p, villageId) => villageId === undefined && granted.has(p) }),
}))
vi.mock('../api/trainingApi.js', () => ({
  getTrainings: vi.fn(), getTrainingCompletions: vi.fn(), recordTrainingCompletions: vi.fn(), deleteTrainingCompletion: vi.fn(),
}))
vi.mock('../../Positions/api/positionApi.js', () => ({ getPositions: vi.fn(), getPositionHolders: vi.fn() }))
vi.mock('../../VolunteerList/api/volunteerApi.js', () => ({ getVolunteerRoster: vi.fn() }))
vi.mock('../../PersonList/api/personApi.js', () => ({ getPersons: vi.fn() }))
vi.mock('../../../shared/lib/csvUtils.js', async (importOriginal) => ({ ...(await importOriginal()), downloadCsv: vi.fn() }))
vi.mock('../../../shared/services/googleSheetsService.js', () => ({ createSheet: vi.fn() }))
import { getTrainings, getTrainingCompletions } from '../api/trainingApi.js'
import { getPositions } from '../../Positions/api/positionApi.js'
import { getPersons } from '../../PersonList/api/personApi.js'
import { downloadCsv } from '../../../shared/lib/csvUtils.js'
import { createSheet } from '../../../shared/services/googleSheetsService.js'

const barrington = { villageId: '1', name: 'Barrington' }
const warwick = { villageId: '7', name: 'Warwick' }
const abbott = { personId: '1', fullName: 'Abbott, Lorraine', displayName: 'Lorraine Abbott', village: barrington, active: true }
const nguyen = { personId: '3', fullName: 'Nguyen, Linh', displayName: 'Linh Nguyen', village: warwick, active: false }
const quinn = { personId: '16', fullName: 'Quinn, Robert', displayName: 'Robert Quinn', village: null, active: true }

// getPersons summary rows: email/phone at the root, the rest under `detail`.
const personRow = (p, first, last, extra = {}) => ({
  personId: p.personId,
  fullName: p.fullName,
  email: `${first.toLowerCase()}@example.com`,
  phone: JSON.stringify({ phone: '401-555-0100', cell: '401-555-0199' }),
  detail: { firstName: first, lastName: last, birthDate: '1950-02-03', gender: { name: 'Female' }, isVeteran: false, ...extra },
})

beforeEach(() => {
  window.matchMedia = () => ({ matches: false, addEventListener () {}, removeEventListener () {} })
  globalThis.ResizeObserver = class { observe () {} unobserve () {} disconnect () {} }
  granted.clear()
  for (const p of ['person:read_birth_date', 'person:read_demographics']) granted.add(p)
  getTrainings.mockResolvedValue([{ trainingId: '4', name: 'LSC Training', description: null, holderCount: 1 }])
  getPositions.mockResolvedValue([])
  getTrainingCompletions.mockResolvedValue([
    { volunteerTrainingId: '9', completedDate: '2026-05-12', notes: 'Refresher, spring', person: abbott },
    { volunteerTrainingId: '10', completedDate: '2025-04-01', notes: null, person: abbott },
    { volunteerTrainingId: '11', completedDate: null, notes: null, person: nguyen },
    { volunteerTrainingId: '12', completedDate: '2026-01-20', notes: null, person: quinn },
  ])
  getPersons.mockResolvedValue([
    personRow(abbott, 'Lorraine', 'Abbott'),
    personRow(nguyen, 'Linh', 'Nguyen'),
    personRow(quinn, 'Robert', 'Quinn', { suffix: 'Jr.' }),
  ])
  createSheet.mockResolvedValue({ url: 'https://sheet' })
})
afterEach(() => { cleanup(); vi.clearAllMocks() })
const opts = { global: { plugins: [PrimeVue], directives: { tooltip: {} } } }

async function download () {
  render(TrainingDetail, opts)
  await screen.findAllByText('Abbott, Lorraine')
  return clickDownload()
}
async function clickDownload () {
  await fireEvent.click(screen.getAllByText('Download')[0])
  await waitFor(() => expect(downloadCsv).toHaveBeenCalledTimes(1))
  const [csv, filename] = downloadCsv.mock.calls[0]
  return { lines: csv.split('\n'), filename }
}

describe('TrainingDetail export', () => {
  it('downloads every shown completion with the person block, in table order', async () => {
    const { lines, filename } = await download()
    expect(filename).toBe('lsc-training-completions.csv')
    expect(getPersons).toHaveBeenCalledWith({ projection: ['detail'] })
    const header = lines[0].split(',')
    expect(header.slice(0, 7)).toEqual(['Full Name', 'Village', 'Status', 'Completed', 'Notes', 'First Name', 'Middle Initial'])
    expect(header).toContain('Birth Date')
    expect(header).toContain('Gender')
    expect(header).toContain('Municipality')
    expect(lines).toHaveLength(5)
    // Repeat completions each carry the same person block.
    expect(lines[1]).toMatch(/^"Abbott, Lorraine",Barrington,Active,2026-05-12,"Refresher, spring",Lorraine,,Abbott,/)
    expect(lines[2]).toMatch(/^"Abbott, Lorraine",Barrington,Active,2025-04-01,,Lorraine,,Abbott,/)
    // Undated: blank, never "No date" and never a reformatted date.
    expect(lines[3]).toMatch(/^"Nguyen, Linh",Warwick,Inactive,,,Linh,,Nguyen,/)
    expect(lines[4]).toMatch(/^"Quinn, Robert",Hub volunteer,Active,2026-01-20,,Robert,,Quinn,Jr\.,/)
    expect(lines[1]).toContain('lorraine@example.com,401-555-0100,401-555-0199')
    expect(lines[1]).toContain('1950-02-03')
  })

  it('exports only the rows the search leaves on screen', async () => {
    render(TrainingDetail, opts)
    await screen.findAllByText('Abbott, Lorraine')
    await fireEvent.update(screen.getByLabelText('Search completions by name'), 'nguyen')
    await waitFor(() => expect(screen.queryByText('Abbott, Lorraine')).toBeNull())
    const { lines } = await clickDownload()
    expect(lines).toHaveLength(2)
    expect(lines[1]).toMatch(/^"Nguyen, Linh",/)
  })

  it('exports every filtered row, not just the current page', async () => {
    getTrainingCompletions.mockResolvedValue(Array.from({ length: 30 }, (_, i) => ({
      volunteerTrainingId: String(100 + i), completedDate: '2026-02-01', notes: null, person: abbott,
    })))
    const { lines } = await download()
    expect(lines).toHaveLength(31)
  })

  it('drops the gated columns when the viewer lacks the permissions', async () => {
    granted.clear()
    const { lines } = await download()
    const header = lines[0].split(',')
    for (const gated of ['Birth Date', 'Gender', 'Ethnicity', 'Race', 'Veteran']) expect(header).not.toContain(gated)
    expect(header).toContain('Email')
    expect(lines[1]).not.toContain('1950-02-03')
  })

  it('creates a Google Sheet named for the training', async () => {
    const { container } = render(TrainingDetail, opts)
    await screen.findAllByText('Abbott, Lorraine')
    await fireEvent.click(container.querySelector('.p-splitbutton-dropdown'))
    await fireEvent.click(await screen.findByText('Create Google Sheet'))
    await waitFor(() => expect(createSheet).toHaveBeenCalledTimes(1))
    const [rows, columns, title] = createSheet.mock.calls[0]
    expect(title).toBe('LSC Training Completions')
    expect(rows).toHaveLength(4)
    expect(columns[0]).toEqual({ header: 'Full Name', key: 'fullName' })
  })
})
