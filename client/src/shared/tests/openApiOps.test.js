import { describe, expect, it } from 'vitest'
import { OpenApiOps } from '../api/openApiOps.js'

// Minimal in-test OpenAPI definition with two ops:
//   - one path-param op (verifies path encoding stays correct)
//   - one query-param op with both scalar and array params (covers all cases)
const definition = {
  servers: [{ url: 'http://localhost/api' }],
  paths: {
    '/villages/{villageId}': {
      get: {
        operationId: 'getVillage',
        parameters: [
          { name: 'villageId', in: 'path', required: true, schema: { type: 'string' } },
        ],
      },
    },
    '/persons': {
      get: {
        operationId: 'getPersons',
        parameters: [
          { name: 'lastName', in: 'query', schema: { type: 'string' } },
          { name: 'status', in: 'query', schema: { type: 'string' } },
          { name: 'projection', in: 'query', schema: { type: 'array', items: { type: 'string' } } },
        ],
      },
    },
  },
}

describe('OpenApiOps URL building', () => {
  const ops = new OpenApiOps({ definition })

  it('encodes spaces in query values as %20 (not +)', () => {
    const url = ops.getUrl('getPersons', {
      lastName: 'Van Der Berg Family',
    })
    expect(url).toBe('http://localhost/api/persons?lastName=Van%20Der%20Berg%20Family')
    expect(url).not.toContain('+')
  })

  it('encodes literal + in query values as %2B', () => {
    const url = ops.getUrl('getPersons', { lastName: '1+1' })
    expect(url).toBe('http://localhost/api/persons?lastName=1%2B1')
  })

  it('serializes array query values with repeated keys (explode form)', () => {
    const url = ops.getUrl('getPersons', { projection: ['member', 'volunteer', 'friend'] })
    expect(url).toBe('http://localhost/api/persons?projection=member&projection=volunteer&projection=friend')
  })

  it('encodes spaces in each element of an array query value', () => {
    const url = ops.getUrl('getPersons', {
      projection: ['with space', 'plain'],
    })
    expect(url).toBe('http://localhost/api/persons?projection=with%20space&projection=plain')
  })

  it('produces clean URLs for plain ASCII values (no over-encoding)', () => {
    const url = ops.getUrl('getPersons', { status: 'Active', lastName: 'Providence_Volunteer_Corps' })
    expect(url).toBe('http://localhost/api/persons?status=Active&lastName=Providence_Volunteer_Corps')
  })

  it('encodes path-param values with spaces as %20 (regression guard)', () => {
    const url = ops.getUrl('getVillage', { villageId: 'Rhode Island Old Colony' })
    expect(url).toBe('http://localhost/api/villages/Rhode%20Island%20Old%20Colony')
  })

  it('omits the ? when there are no query params', () => {
    const url = ops.getUrl('getVillage', { villageId: 'Providence_Downtown' })
    expect(url).toBe('http://localhost/api/villages/Providence_Downtown')
    expect(url).not.toContain('?')
  })
})
