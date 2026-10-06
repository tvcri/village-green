import { describe, it, expect } from 'vitest'
import {
  scopeLabel, eligibleVillageIds, isPositionEligible, missingExpectedTrainings,
  positionsLostOnVillageChange, positionPlace,
} from './positionRules.js'

const pos = (name, scope, villageId = null, villageName = null) =>
  ({ name, scope, village: villageId ? { villageId, name: villageName } : null, circle: null })

describe('positionRules', () => {
  it('labels scopes for the UI', () => {
    expect(scopeLabel('federation')).toBe('Hub')
    expect(scopeLabel('village')).toBe('Village')
    expect(scopeLabel('circle')).toBe('Circle')
  })

  it('eligible villages are home plus associates, as strings, without blanks', () => {
    expect(eligibleVillageIds(2, ['5', 2])).toEqual(['2', '5'])
    expect(eligibleVillageIds(null, [])).toEqual([])
  })

  it('only village positions need an eligible village', () => {
    expect(isPositionEligible({ scope: 'federation', villageId: null }, null, [])).toBe(true)
    expect(isPositionEligible({ scope: 'village', villageId: '5' }, '2', ['5'])).toBe(true)
    expect(isPositionEligible({ scope: 'village', villageId: '9' }, '2', ['5'])).toBe(false)
  })

  it('lists expected trainings the volunteer has no record of', () => {
    expect(missingExpectedTrainings(['4', '5'], [{ trainingId: '4' }])).toEqual(['5'])
    expect(missingExpectedTrainings([], [])).toEqual([])
  })

  it('home village changed: loses positions there, keeps associate-covered and Hub ones', () => {
    const positions = [pos('Steering Committee', 'village', '1', 'Barrington'), pos('Member Ambassador', 'village', '7', 'Warwick'), pos('Board', 'federation')]
    const lost = positionsLostOnVillageChange({ positions, associateVillageIds: ['7'], newHomeVillageId: '3' })
    expect(lost.map(p => p.name)).toEqual(['Steering Committee'])
  })

  it('home village cleared: loses every village position not covered by an associate', () => {
    const positions = [pos('SC', 'village', '1', 'Barrington'), pos('LSC', 'village', '1', 'Barrington')]
    expect(positionsLostOnVillageChange({ positions, associateVillageIds: [], newHomeVillageId: null })).toHaveLength(2)
  })

  it('new home is an existing associate: nothing at that village is lost', () => {
    const positions = [pos('MA', 'village', '7', 'Warwick')]
    expect(positionsLostOnVillageChange({ positions, associateVillageIds: ['7'], newHomeVillageId: '7' })).toEqual([])
  })

  it('names where a position is held', () => {
    expect(positionPlace(pos('SC', 'village', '1', 'Barrington'))).toBe('Barrington')
    expect(positionPlace({ scope: 'circle', village: null, circle: { circleId: '3', name: 'DownCity' } })).toBe('DownCity')
    expect(positionPlace(pos('Board', 'federation'))).toBe('Hub')
  })
})
