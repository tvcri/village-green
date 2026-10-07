// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/vue'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import PrimeVue from 'primevue/config'
import PositionDetail from '../components/PositionDetail.vue'

const granted = new Set()
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { positionId: '5' } }),
  useRouter: () => ({ push: vi.fn() }),
  onBeforeRouteLeave: vi.fn(),
}))
vi.mock('primevue/useconfirm', () => ({ useConfirm: () => ({ require: vi.fn() }) }))
vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: vi.fn() }) }))
vi.mock('../../../shared/composables/useCurrentUser.js', () => ({
  useCurrentUser: () => ({ hasPermission: (p, villageId) => villageId === undefined && granted.has(p) }),
}))
vi.mock('../api/positionApi.js', () => ({ getPositions: vi.fn(), getPositionHolders: vi.fn(), patchPositionHolders: vi.fn() }))
vi.mock('../../Trainings/api/trainingApi.js', () => ({ getTrainings: vi.fn(), getTrainingCompletions: vi.fn() }))
vi.mock('../../VolunteerList/api/volunteerApi.js', () => ({ getVolunteerRoster: vi.fn() }))
vi.mock('../../VillageList/api/villageApi.js', () => ({ getVillages: vi.fn() }))
vi.mock('../../PersonList/api/personApi.js', () => ({ getCircles: vi.fn(), getPersons: vi.fn() }))
vi.mock('../../../shared/lib/csvUtils.js', async (importOriginal) => ({ ...(await importOriginal()), downloadCsv: vi.fn() }))
vi.mock('../../../shared/services/googleSheetsService.js', () => ({ createSheet: vi.fn() }))
import { getPositions, getPositionHolders } from '../api/positionApi.js'
import { getTrainings, getTrainingCompletions } from '../../Trainings/api/trainingApi.js'
import { getVolunteerRoster } from '../../VolunteerList/api/volunteerApi.js'
import { getVillages } from '../../VillageList/api/villageApi.js'
import { getCircles, getPersons } from '../../PersonList/api/personApi.js'
import { downloadCsv } from '../../../shared/lib/csvUtils.js'
import { createSheet } from '../../../shared/services/googleSheetsService.js'

const barrington = { villageId: '1', name: 'Barrington' }
const bristol = { villageId: '3', name: 'Bristol-Warren' }
const warwick = { villageId: '7', name: 'Warwick' }
const abbott = { personId: '1', fullName: 'Abbott, Lorraine', displayName: 'Lorraine Abbott', village: barrington, active: true }
const silva = { personId: '2', fullName: 'Silva, Maria', displayName: 'Maria Silva', village: warwick, active: false }
const medeiros = { personId: '8', fullName: 'Medeiros, Anthony', displayName: 'Anthony Medeiros', village: bristol, active: true }

const personRow = (p, first, last) => ({
  personId: p.personId,
  fullName: p.fullName,
  email: `${first.toLowerCase()}@example.com`,
  phone: { phone: '401-555-0100', cell: null },
  detail: { firstName: first, lastName: last, birthDate: '1950-02-03', gender: { name: 'Female' } },
})

beforeEach(() => {
  window.matchMedia = () => ({ matches: false, addEventListener () {}, removeEventListener () {} })
  globalThis.ResizeObserver = class { observe () {} unobserve () {} disconnect () {} }
  granted.clear()
  for (const p of ['volunteer:write', 'person:read_birth_date', 'person:read_demographics']) granted.add(p)
  getPositions.mockResolvedValue([{ positionId: '5', name: 'Local Service Coordinator', scope: 'village', trainingIds: ['4', '6'], holderCount: 3 }])
  getTrainings.mockResolvedValue([{ trainingId: '4', name: 'LSC Training' }, { trainingId: '6', name: 'CPR' }])
  getTrainingCompletions.mockImplementation(async (id) => (id === '4'
    ? [
        { volunteerTrainingId: '9', completedDate: '2025-01-01', person: { personId: '1' } },
        { volunteerTrainingId: '10', completedDate: '2026-05-12', person: { personId: '1' } },
        { volunteerTrainingId: '11', completedDate: null, person: { personId: '2' } },
      ]
    : [{ volunteerTrainingId: '12', completedDate: '2026-03-03', person: { personId: '8' } }]))
  getVillages.mockResolvedValue([barrington, bristol, warwick])
  getCircles.mockResolvedValue([])
  // Out of name order on purpose: the export sorts by name within a group.
  getPositionHolders.mockResolvedValue([
    { volunteerPositionId: '22', village: barrington, circle: null, person: silva },
    { volunteerPositionId: '20', village: barrington, circle: null, person: abbott },
    { volunteerPositionId: '21', village: bristol, circle: null, person: medeiros },
  ])
  getVolunteerRoster.mockResolvedValue([
    { personId: '5', fullName: 'Walsh, Bridget', displayName: 'Bridget Walsh', village: barrington, active: true, associateVillages: [] },
  ])
  getPersons.mockResolvedValue([personRow(abbott, 'Lorraine', 'Abbott'), personRow(silva, 'Maria', 'Silva'), personRow(medeiros, 'Anthony', 'Medeiros')])
  createSheet.mockResolvedValue({ url: 'https://sheet' })
})
afterEach(() => { cleanup(); vi.clearAllMocks() })
const opts = { global: { plugins: [PrimeVue], directives: { tooltip: {} } } }

async function clickDownload () {
  await fireEvent.click(screen.getByText('Download'))
  await waitFor(() => expect(downloadCsv).toHaveBeenCalledTimes(1))
  const [csv, filename] = downloadCsv.mock.calls[0]
  return { lines: csv.split('\n'), filename }
}

describe('PositionDetail export', () => {
  it('exports saved holders by group then name, with Held Through and expected-training columns', async () => {
    render(PositionDetail, opts)
    await screen.findByText('Abbott, Lorraine')
    const { lines, filename } = await clickDownload()
    expect(filename).toBe('local-service-coordinator-holders.csv')
    expect(getPersons).toHaveBeenCalledWith({ projection: ['detail'] })
    const header = lines[0].split(',')
    expect(header.slice(0, 7)).toEqual(['Full Name', 'Where', 'Held Through', 'Status', 'LSC Training', 'CPR', 'First Name'])
    expect(header).toContain('Birth Date')
    expect(lines).toHaveLength(4)
    expect(lines[1]).toMatch(/^"Abbott, Lorraine",Barrington,Home,Active,2026-05-12,,Lorraine,,Abbott,/)
    expect(lines[2]).toMatch(/^"Silva, Maria",Barrington,Associate,Inactive,No date,,Maria,,Silva,/)
    expect(lines[3]).toMatch(/^"Medeiros, Anthony",Bristol-Warren,Home,Active,,2026-03-03,Anthony,,Medeiros,/)
    expect(lines[1]).toContain('lorraine@example.com,401-555-0100,,')
  })

  it('ignores a staged add and a pending removal', async () => {
    render(PositionDetail, opts)
    await screen.findByText('Abbott, Lorraine')
    await fireEvent.click(screen.getByLabelText('Add a holder in Barrington'))
    const input = await screen.findByLabelText('Add a volunteer in Barrington')
    await fireEvent.focus(input)
    await fireEvent.update(input, 'wal')
    await fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getByText('New')).toBeInTheDocument()
    await fireEvent.click(screen.getByLabelText('Remove Anthony Medeiros from this position'))
    expect(screen.getByText('Will be removed')).toBeInTheDocument()
    const { lines } = await clickDownload()
    // The saved state: Medeiros still holds it until Save; Walsh does not yet.
    expect(lines.map(l => l.split('",')[0])).toEqual([expect.any(String), '"Abbott, Lorraine', '"Silva, Maria', '"Medeiros, Anthony'])
    expect(lines.join('\n')).not.toContain('Walsh')
  })

  it('omits Held Through and training columns for a Hub position without expected trainings', async () => {
    getPositions.mockResolvedValue([{ positionId: '5', name: 'Hub Driver Lead', scope: 'federation', trainingIds: [], holderCount: 1 }])
    getPositionHolders.mockResolvedValue([{ volunteerPositionId: '30', village: null, circle: null, person: medeiros }])
    granted.delete('person:read_birth_date')
    granted.delete('person:read_demographics')
    render(PositionDetail, opts)
    await screen.findByText('Medeiros, Anthony')
    const { lines, filename } = await clickDownload()
    expect(filename).toBe('hub-driver-lead-holders.csv')
    const header = lines[0].split(',')
    expect(header.slice(0, 4)).toEqual(['Full Name', 'Where', 'Status', 'First Name'])
    for (const gated of ['Birth Date', 'Gender', 'Veteran']) expect(header).not.toContain(gated)
    expect(lines[1]).toMatch(/^"Medeiros, Anthony",Hub,Active,Anthony,/)
  })

  it('creates a Google Sheet named for the position', async () => {
    const { container } = render(PositionDetail, opts)
    await screen.findByText('Abbott, Lorraine')
    await fireEvent.click(container.querySelector('.p-splitbutton-dropdown'))
    await fireEvent.click(await screen.findByText('Create Google Sheet'))
    await waitFor(() => expect(createSheet).toHaveBeenCalledTimes(1))
    const [rows, , title] = createSheet.mock.calls[0]
    expect(title).toBe('Local Service Coordinator Holders')
    expect(rows).toHaveLength(3)
  })
})
