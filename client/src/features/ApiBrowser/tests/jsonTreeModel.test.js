import { describe, expect, it } from 'vitest'
import { childNodes, isContainer, pathsToDepth, sizeOf, summaryOf, typeOf } from '../lib/jsonTreeModel.js'

describe('typeOf', () => {
  it('distinguishes null, array and object', () => {
    expect(typeOf(null)).toBe('null')
    expect(typeOf([])).toBe('array')
    expect(typeOf({})).toBe('object')
    expect(typeOf('s')).toBe('string')
    expect(typeOf(1)).toBe('number')
    expect(typeOf(true)).toBe('boolean')
  })
})

describe('isContainer', () => {
  it('treats empty containers as leaves so they get no caret', () => {
    expect(isContainer({})).toBe(false)
    expect(isContainer([])).toBe(false)
  })

  it('treats non-empty containers as containers', () => {
    expect(isContainer({ a: 1 })).toBe(true)
    expect(isContainer([1])).toBe(true)
  })

  it('treats scalars as leaves', () => {
    expect(isContainer('x')).toBe(false)
    expect(isContainer(null)).toBe(false)
  })
})

describe('summaryOf', () => {
  it('annotates collapsed containers with their size', () => {
    expect(summaryOf({ a: 1, b: 2, c: 3 })).toBe('{3}')
    expect(summaryOf([1, 2, 3, 4, 5])).toBe('[5]')
    expect(summaryOf('x')).toBe('')
  })
})

describe('childNodes', () => {
  it('keys array children by string index and builds dotted paths', () => {
    const { nodes } = childNodes(['a', 'b'], '$', 100)
    expect(nodes.map(n => n.key)).toEqual(['0', '1'])
    expect(nodes.map(n => n.path)).toEqual(['$.0', '$.1'])
  })

  it('respects the limit and reports how many are hidden', () => {
    const { nodes, hidden } = childNodes([1, 2, 3, 4, 5], '$', 2)
    expect(nodes).toHaveLength(2)
    expect(hidden).toBe(3)
  })

  it('reports zero hidden when everything fits', () => {
    expect(childNodes({ a: 1 }, '$', 10).hidden).toBe(0)
  })
})

describe('pathsToDepth', () => {
  it('expands exactly N levels', () => {
    const value = { a: { b: { c: 1 } }, d: [1] }
    expect(pathsToDepth(value, 1)).toEqual(new Set(['$']))
    expect(pathsToDepth(value, 2)).toEqual(new Set(['$', '$.a', '$.d']))
  })

  it('does not add leaves or empty containers', () => {
    expect(pathsToDepth({ a: 1, b: {} }, 5)).toEqual(new Set(['$']))
  })

  // dereferenceSync aliases subtrees: 5407 of 7828 object visits in this spec
  // are repeat visits to the SAME reference. Positional path keys are what make
  // aliased objects expand independently; a per-node mutable flag would not.
  it('gives two positions of the same object reference distinct paths', () => {
    const shared = { x: { y: 1 } }
    const value = { first: shared, second: shared }
    const paths = pathsToDepth(value, 3)
    expect(paths.has('$.first')).toBe(true)
    expect(paths.has('$.second')).toBe(true)
    expect(paths.has('$.first.x')).toBe(true)
    expect(paths.has('$.second.x')).toBe(true)
  })
})
