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
  ])
}

describe('buildOperationRows', () => {
  it('returns only GET operations', () => {
    const rows = buildOperationRows(fixtureMap())
    expect(rows.every(r => r.method === 'GET')).toBe(true)
    expect(rows.find(r => r.operationId === 'createVillage')).toBeUndefined()
  })

  it('excludes streamStateSse', () => {
    const rows = buildOperationRows(fixtureMap())
    expect(rows.find(r => r.operationId === 'streamStateSse')).toBeUndefined()
    expect(EXCLUDED_OPERATION_IDS.has('streamStateSse')).toBe(true)
  })

  it('projects tag, path, summary and a param count', () => {
    const rows = buildOperationRows(fixtureMap())
    const row = rows.find(r => r.operationId === 'getVillage')
    expect(row).toEqual({
      operationId: 'getVillage',
      method: 'GET',
      tag: 'Village',
      path: '/villages/{villageId}',
      summary: 'Return a Village',
      paramCount: 2,
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
