import { describe, it, expect } from 'vitest'
import { holderGroups, isPositionCandidate, candidateStatus, candidateNote, buildHoldersPatch } from './holderStaging.js'

const villages = [{ villageId: '1', name: 'Barrington' }, { villageId: '2', name: 'Aquidneck Island' }, { villageId: '7', name: 'Warwick' }]
const vPos = { positionId: '5', scope: 'village' }
const holders = [{ volunteerPositionId: '20', village: villages[0], circle: null, person: { personId: '1', fullName: 'Abbott, Lorraine' } }]

describe('holderGroups', () => {
  it('village scope: every village, holders first, then empty ones by name', () => {
    const g = holderGroups({ position: vPos, holders, villages, circles: [], adds: [] })
    expect(g.map(x => x.label)).toEqual(['Barrington', 'Aquidneck Island', 'Warwick'])
    expect(g[0].rows).toHaveLength(1)
    expect(g[1].rows).toHaveLength(0)
  })
  it('a group with only a staged add counts as non-empty', () => {
    const g = holderGroups({ position: vPos, holders: [], villages, circles: [], adds: [{ key: '3|7|', personId: '3', villageId: '7', circleId: null }] })
    expect(g[0].label).toBe('Warwick')
  })
  it('Hub scope: one group', () => {
    const g = holderGroups({ position: { scope: 'federation' }, holders: [], villages, circles: [], adds: [] })
    expect(g).toEqual([{ key: 'hub', label: 'Holders', villageId: null, circleId: null, rows: [], adds: [] }])
  })
})

describe('isPositionCandidate', () => {
  const group = { key: '1', label: 'Barrington', villageId: '1', circleId: null }
  const vol = (over) => ({ personId: '2', village: villages[0], associateVillages: [], active: true, ...over })
  it('an active volunteer of the village qualifies', () => {
    expect(isPositionCandidate(vol(), group, vPos)).toBe(true)
  })
  it('an inactive volunteer never does', () => {
    expect(isPositionCandidate(vol({ active: false }), group, vPos)).toBe(false)
    expect(isPositionCandidate(vol({ active: false }), { key: 'hub', villageId: null, circleId: null }, { scope: 'federation' })).toBe(false)
  })
  it('another village does not; an associate village does', () => {
    expect(isPositionCandidate(vol({ village: villages[2] }), group, vPos)).toBe(false)
    expect(isPositionCandidate(vol({ village: villages[2], associateVillages: [{ villageId: '1', name: 'Barrington' }] }), group, vPos)).toBe(true)
  })
  it('a Hub volunteer does not qualify for a village group, but does for a Hub position', () => {
    expect(isPositionCandidate(vol({ village: null }), group, vPos)).toBe(false)
    expect(isPositionCandidate(vol({ village: null }), { key: 'hub', villageId: null, circleId: null }, { scope: 'federation' })).toBe(true)
  })
})

describe('candidateStatus', () => {
  const group = { key: '1', label: 'Barrington', villageId: '1', circleId: null }
  it('already holds -> disabled', () => {
    expect(candidateStatus({ personId: '1', village: villages[0], associateVillages: [] }, group, holders, [])).toEqual({ disabled: true, reason: 'Already holds it' })
  })
  it('already staged -> disabled', () => {
    expect(candidateStatus({ personId: '3' }, group, [], [{ personId: '3', villageId: '1', circleId: null }]).disabled).toBe(true)
  })
  it('otherwise pickable', () => {
    expect(candidateStatus({ personId: '3' }, group, holders, [])).toEqual({ disabled: false, reason: null })
  })
})

describe('candidateNote', () => {
  it('names the village for a village group, and active volunteers otherwise', () => {
    expect(candidateNote({ label: 'Barrington', villageId: '1' })).toBe('Lists active volunteers whose village or associate village is Barrington.')
    expect(candidateNote({ label: 'Holders', villageId: null })).toBe('Lists active volunteers.')
  })
})

describe('buildHoldersPatch', () => {
  it('maps staged adds and removals', () => {
    expect(buildHoldersPatch([{ key: 'k', personId: '3', villageId: '1', circleId: null }], new Set(['20'])))
      .toEqual({ add: [{ personId: '3', villageId: '1', circleId: null }], remove: ['20'] })
  })
})
