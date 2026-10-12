import { describe, it, expect } from 'vitest'
import { volunteerSnapshot, summarizeVolunteerChanges } from './volunteerChanges.js'

const base = () => ({
  active: true,
  notes: 'Existing notes',
  capabilityIds: [1, 2],
  associateVillageIds: ['7'],
  vettings: [{ key: 'vv0', vettingTypeId: '1', dateEntered: '2025-01-02', dateExpired: null, notes: 'x' }],
  trainings: [{ key: 'vt9', trainingId: '1', completedDate: '2025-04-25', notes: 'email' }],
  positions: [{ positionId: '3', villageId: '7', circleId: null }],
})
const summarize = (after, before = base()) => summarizeVolunteerChanges(volunteerSnapshot(before), volunteerSnapshot(after))

describe('summarizeVolunteerChanges', () => {
  it('is empty when nothing changed', () => {
    expect(summarize(base())).toEqual([])
  })

  it('ignores order in id lists and null vs empty text', () => {
    const after = base()
    after.capabilityIds = [2, 1]
    after.trainings = [{ ...after.trainings[0], notes: 'email' }]
    const before = base()
    before.notes = ''
    after.notes = null
    expect(summarize(after, before)).toEqual([])
  })

  it('counts added, removed and changed rows per kind, in form order', () => {
    const after = base()
    after.vettings = [{ ...after.vettings[0], dateExpired: '2027-01-02' }, { key: 'new1', vettingTypeId: '2', dateEntered: null, dateExpired: null }]
    after.trainings = [
      { key: 'new2', trainingId: '4', completedDate: null, notes: null },
      { key: 'new3', trainingId: '1', completedDate: '2026-01-01', notes: null },
    ]
    after.positions = [{ positionId: '2', villageId: null, circleId: null }]
    expect(summarize(after)).toEqual([
      '1 vetting added', '1 vetting changed',
      '2 trainings added', '1 training removed',
      '1 position added', '1 position removed',
    ])
  })

  it('a training notes edit counts as changed', () => {
    const after = base()
    after.trainings = [{ ...after.trainings[0], notes: 'paper' }]
    expect(summarize(after)).toEqual(['1 training changed'])
  })

  it('names edited provider fields in one entry', () => {
    const after = base()
    after.active = false
    after.capabilityIds = [1]
    after.associateVillageIds = ['7', '9']
    after.notes = 'New'
    expect(summarize(after)).toEqual(['active, capabilities, associate villages, notes edited'])
  })
})
