import { describe, it, expect } from 'vitest'
import { holderGroups, candidateStatus, buildHoldersPatch } from './holderStaging.js'

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

describe('candidateStatus', () => {
  const group = { key: '1', label: 'Barrington', villageId: '1', circleId: null }
  it('already holds -> disabled', () => {
    expect(candidateStatus({ personId: '1', village: villages[0], associateVillages: [] }, group, vPos, holders, [])).toEqual({ disabled: true, reason: 'Already holds it' })
  })
  it('ineligible -> disabled with the reason and the fix', () => {
    const s = candidateStatus({ personId: '2', village: villages[2], associateVillages: [] }, group, vPos, holders, [])
    expect(s.disabled).toBe(true)
    expect(s.reason).toBe('Home village is Warwick. To add them in Barrington, add it as an associate village in their volunteer form.')
  })
  it('associate village qualifies', () => {
    expect(candidateStatus({ personId: '3', village: villages[2], associateVillages: [{ villageId: '1', name: 'Barrington' }] }, group, vPos, holders, []).disabled).toBe(false)
  })
  it('Hub volunteer reason', () => {
    expect(candidateStatus({ personId: '4', village: null, associateVillages: [] }, group, vPos, [], []).reason).toMatch(/^Hub volunteer, no home village\./)
  })
})

describe('buildHoldersPatch', () => {
  it('maps staged adds and removals', () => {
    expect(buildHoldersPatch([{ key: 'k', personId: '3', villageId: '1', circleId: null }], new Set(['20'])))
      .toEqual({ add: [{ personId: '3', villageId: '1', circleId: null }], remove: ['20'] })
  })
})
