import { describe, it, expect } from 'vitest'
import { trainingFlag, positionFlag, batchSummary, resultMessage } from './completionFlags.js'

const completions = [
  { volunteerTrainingId: '1', completedDate: '2025-04-25', notes: null, person: { personId: '2' } },
  { volunteerTrainingId: '2', completedDate: '2023-05-02', notes: null, person: { personId: '2' } },
  { volunteerTrainingId: '3', completedDate: null, notes: 'old', person: { personId: '14' } },
]
const vol = (personId, village) => ({ personId, village })
const barrington = { villageId: '1', name: 'Barrington' }

describe('trainingFlag', () => {
  it('skip, prior, undated and first', () => {
    expect(trainingFlag('2', completions, '2025-04-25').kind).toBe('skip')
    expect(trainingFlag('2', completions, '2026-10-06').text).toBe('Last completed Apr 25, 2025')
    expect(trainingFlag('14', completions, '2026-10-06').text).toBe('Has an undated record')
    expect(trainingFlag('99', completions, '2026-10-06').text).toBe('First completion')
  })
})

describe('positionFlag', () => {
  const village = { positionId: '5', name: 'Local Service Coordinator', scope: 'village' }
  const hub = { positionId: '2', name: 'Board', scope: 'federation' }
  const holders = [{ person: { personId: '1' }, village: barrington }]
  it('village: will be assigned at home, already holds, no home village', () => {
    expect(positionFlag(vol('3', barrington), village, holders)).toMatchObject({ assign: true, text: 'Will be assigned · Barrington' })
    expect(positionFlag(vol('1', barrington), village, holders)).toMatchObject({ assign: false, text: 'Already holds it in Barrington' })
    expect(positionFlag(vol('16', null), village, holders)).toMatchObject({ assign: false, text: 'Not assigned: no home village' })
  })
  it('Hub: anyone not holding it', () => {
    expect(positionFlag(vol('16', null), hub, [])).toMatchObject({ assign: true, text: 'Will be assigned · Hub' })
  })
  it('no position: null', () => {
    expect(positionFlag(vol('1', barrington), null, [])).toBeNull()
  })
})

describe('batchSummary and resultMessage', () => {
  it('counts records, skips and assignments', () => {
    const s = batchSummary([{ training: { kind: 'skip' }, position: null }, { training: { kind: 'first' }, position: { assign: true } }])
    expect(s).toEqual({ toSave: 1, skipped: 1, toAssign: 1 })
  })
  it('builds the toast from the response', () => {
    expect(resultMessage({
      trainingName: 'LSC Training', date: '2026-10-06', positionName: 'Local Service Coordinator',
      result: { recorded: ['1', '2'], skipped: ['3'], assigned: ['1'], notAssigned: [] },
    })).toBe('Recorded LSC Training on Oct 6, 2026 for 2 volunteers. 1 already had it for that date and was skipped. Assigned Local Service Coordinator to 1 volunteer.')
  })
})
