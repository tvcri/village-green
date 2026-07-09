import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeRng } from '../generator/rng.js'

test('makeRng is deterministic for a given seed', () => {
  const a = makeRng(42)
  const b = makeRng(42)
  const seqA = Array.from({ length: 8 }, () => a.next())
  const seqB = Array.from({ length: 8 }, () => b.next())
  assert.deepEqual(seqA, seqB)
})

test('different seeds produce different sequences', () => {
  const a = makeRng(1).next()
  const b = makeRng(2).next()
  assert.notEqual(a, b)
})

test('helpers stay in range and are reproducible', () => {
  const r = makeRng(7)
  for (let i = 0; i < 100; i++) {
    const n = r.int(3, 9)
    assert.ok(n >= 3 && n <= 9 && Number.isInteger(n))
  }
  const r1 = makeRng(7); const r2 = makeRng(7)
  assert.deepEqual(r1.shuffle([1, 2, 3, 4, 5]), r2.shuffle([1, 2, 3, 4, 5]))
  assert.equal(typeof r1.pick(['x', 'y']), 'string')
  assert.equal(typeof r1.bool(0.5), 'boolean')
})
