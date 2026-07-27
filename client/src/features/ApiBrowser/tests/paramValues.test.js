import { describe, expect, it } from 'vitest'
import { initialValues, isOmitted, toParams } from '../lib/paramValues.js'

describe('isOmitted', () => {
  it('omits null and undefined', () => {
    expect(isOmitted(null)).toBe(true)
    expect(isOmitted(undefined)).toBe(true)
  })

  it('omits empty and whitespace-only strings', () => {
    expect(isOmitted('')).toBe(true)
    expect(isOmitted('   ')).toBe(true)
  })

  it('omits empty arrays', () => {
    expect(isOmitted([])).toBe(true)
  })

  // These two are the regression guards that matter: a naive `if (value)`
  // filter passes every other case and silently drops elevate=false and
  // after-seq=0.
  it('KEEPS false', () => {
    expect(isOmitted(false)).toBe(false)
  })

  it('KEEPS zero', () => {
    expect(isOmitted(0)).toBe(false)
  })

  it('keeps the string "0"', () => {
    expect(isOmitted('0')).toBe(false)
  })

  it('keeps non-empty values', () => {
    expect(isOmitted('abc')).toBe(false)
    expect(isOmitted(['a'])).toBe(false)
  })
})

describe('toParams', () => {
  const descriptors = [
    { name: 'villageId' }, { name: 'elevate' }, { name: 'projection' }, { name: 'afterSeq' },
  ]

  it('drops omitted values and keeps real ones', () => {
    const values = { villageId: '3', elevate: false, projection: [], afterSeq: 0 }
    expect(toParams(descriptors, values)).toEqual({ villageId: '3', elevate: false, afterSeq: 0 })
  })

  it('never emits a key for an empty text field', () => {
    expect(toParams([{ name: 'lastName' }], { lastName: '' })).toEqual({})
  })

  it('ignores values with no matching descriptor', () => {
    expect(toParams([{ name: 'a' }], { a: '1', bogus: 'x' })).toEqual({ a: '1' })
  })
})

describe('initialValues', () => {
  it('creates a null entry per descriptor and never pre-fills defaults', () => {
    const descriptors = [{ name: 'elevate', default: false }, { name: 'scope' }]
    expect(initialValues(descriptors)).toEqual({ elevate: null, scope: null })
  })
})
