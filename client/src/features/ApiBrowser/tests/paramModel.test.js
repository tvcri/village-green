import { describe, expect, it } from 'vitest'
import { buildDescriptors, toFieldDescriptor } from '../lib/paramModel.js'

describe('toFieldDescriptor', () => {
  it('maps an array with items.enum to a multiselect', () => {
    const d = toFieldDescriptor({
      name: 'projection', in: 'query', style: 'form', explode: true,
      schema: { type: 'array', uniqueItems: true, items: { type: 'string', enum: ['webPreferences', 'privacyStatus'] } },
    })
    expect(d.control).toBe('multiselect')
    expect(d.options).toEqual(['webPreferences', 'privacyStatus'])
  })

  it('maps a plain array to chips', () => {
    const d = toFieldDescriptor({
      name: 'villageId', in: 'query', style: 'form', explode: true,
      schema: { type: 'array', items: { type: 'string', pattern: '^[0-9]{1,10}$' } },
    })
    expect(d.control).toBe('chips')
  })

  // Precedence guard: username-match is type:string AND has an enum. The
  // dropdown must win over the text box.
  it('prefers select over text when a string has an enum', () => {
    const d = toFieldDescriptor({
      name: 'username-match', in: 'query',
      schema: { type: 'string', default: 'exact', enum: ['exact', 'startsWith', 'endsWith', 'contains'] },
    })
    expect(d.control).toBe('select')
    expect(d.options).toHaveLength(4)
    expect(d.default).toBe('exact')
    expect(d.placeholder).toBe('exact')
  })

  it('maps a boolean to tristate and carries its default', () => {
    const d = toFieldDescriptor({
      name: 'elevate', in: 'query', schema: { type: 'boolean', default: false },
    })
    expect(d.control).toBe('tristate')
    expect(d.default).toBe(false)
  })

  it('maps an integer to number', () => {
    const d = toFieldDescriptor({
      name: 'after-seq', in: 'query', schema: { type: 'integer', minimum: 0 },
    })
    expect(d.control).toBe('number')
  })

  it('maps format:date to date', () => {
    const d = toFieldDescriptor({
      name: 'dateStart', in: 'query', schema: { type: 'string', format: 'date' },
    })
    expect(d.control).toBe('date')
  })

  it('maps format:date-time to text, not date', () => {
    const d = toFieldDescriptor({
      name: 'from', in: 'query', schema: { type: 'string', format: 'date-time' },
    })
    expect(d.control).toBe('text')
  })

  it('maps a required enum and marks it required', () => {
    const d = toFieldDescriptor({
      name: 'scope', in: 'query', required: true,
      schema: { type: 'string', enum: ['open', 'mine', 'history'] },
    })
    expect(d.control).toBe('select')
    expect(d.required).toBe(true)
  })

  it('maps a path param to text, required, with its pattern', () => {
    const d = toFieldDescriptor({
      name: 'villageId', in: 'path', required: true,
      schema: { type: 'string', pattern: '^[0-9]{1,10}$' },
    })
    expect(d.control).toBe('text')
    expect(d.in).toBe('path')
    expect(d.required).toBe(true)
    expect(d.pattern).toBe('^[0-9]{1,10}$')
  })

  it('falls back to text for a schema-less param', () => {
    expect(toFieldDescriptor({ name: 'mystery', in: 'query' }).control).toBe('text')
  })
})

describe('buildDescriptors', () => {
  it('orders path params before query params', () => {
    const params = {
      elevate: { name: 'elevate', in: 'query', schema: { type: 'boolean' } },
      villageId: { name: 'villageId', in: 'path', required: true, schema: { type: 'string' } },
    }
    expect(buildDescriptors(params).map(d => d.name)).toEqual(['villageId', 'elevate'])
  })

  it('returns an empty array for an operation with no params', () => {
    expect(buildDescriptors({})).toEqual([])
  })
})
