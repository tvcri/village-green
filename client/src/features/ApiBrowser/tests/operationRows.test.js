import { describe, expect, it } from 'vitest'
import { buildOperationRows, EXCLUDED_OPERATION_IDS } from '../lib/operationRows.js'

function fixtureMap() {
  return new Map([
    ['getVillages', {
      path: '/villages', method: 'get', params: {},
      summary: 'Return a list of Villages', tags: ['Village'],
    }],
    ['getVillage', {
      path: '/villages/{villageId}', method: 'get',
      params: { villageId: { name: 'villageId', in: 'path' }, elevate: { name: 'elevate', in: 'query' } },
      summary: 'Return a Village', tags: ['Village'],
    }],
    ['streamStateSse', {
      path: '/op/state/sse', method: 'get', params: {},
      summary: 'Stream state', tags: ['Operation'],
    }],
    ['createVillage', {
      path: '/villages', method: 'post', params: {},
      summary: 'Create a Village', tags: ['Village'],
    }],
    ['getJobs', {
      path: '/jobs', method: 'get', params: {},
      summary: 'Return the Jobs', tags: ['Job'], elevationRequired: true,
    }],
  ])
}

describe('buildOperationRows', () => {
  it('returns only GET operations', () => {
    const rows = buildOperationRows(fixtureMap())
    expect(rows.every(r => r.method === 'GET')).toBe(true)
    expect(rows.find(r => r.operationId === 'createVillage')).toBeUndefined()
  })

  // x-elevation-required operations would 403 for a user who cannot elevate,
  // so they are omitted entirely rather than listed and left to fail.
  it('hides elevation-required operations when the user cannot elevate', () => {
    const rows = buildOperationRows(fixtureMap(), { canElevate: false })
    expect(rows.find(r => r.operationId === 'getJobs')).toBeUndefined()
    // Non-elevated operations are unaffected.
    expect(rows.find(r => r.operationId === 'getVillages')).toBeDefined()
  })

  it('shows elevation-required operations when the user can elevate', () => {
    const rows = buildOperationRows(fixtureMap(), { canElevate: true })
    expect(rows.find(r => r.operationId === 'getJobs')).toBeDefined()
  })

  // Fail closed: an omitted flag must hide them, not reveal them.
  it('hides elevation-required operations when no option is passed', () => {
    const rows = buildOperationRows(fixtureMap())
    expect(rows.find(r => r.operationId === 'getJobs')).toBeUndefined()
  })

  it('excludes streamStateSse', () => {
    const rows = buildOperationRows(fixtureMap())
    expect(rows.find(r => r.operationId === 'streamStateSse')).toBeUndefined()
    expect(EXCLUDED_OPERATION_IDS.has('streamStateSse')).toBe(true)
  })

  it('projects tag, path and summary', () => {
    const rows = buildOperationRows(fixtureMap())
    const row = rows.find(r => r.operationId === 'getVillage')
    expect(row).toEqual({
      operationId: 'getVillage',
      method: 'GET',
      tag: 'Village',
      path: '/villages/{villageId}',
      summary: 'Return a Village',
    })
  })

  it('uses an empty tag when the operation declares none', () => {
    const map = new Map([['getThing', { path: '/thing', method: 'get', params: {}, summary: 'x', tags: [] }]])
    expect(buildOperationRows(map)[0].tag).toBe('')
  })

  it('sorts by tag then path', () => {
    const rows = buildOperationRows(fixtureMap())
    expect(rows.map(r => r.operationId)).toEqual(['getVillages', 'getVillage'])
  })
})
