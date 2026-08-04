import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveVillages } from '../generator/sizing.js'
import { VILLAGES } from '../generator/constants.js'

test('sizing: defaults — all 10 villages, mix-driven targets', () => {
  const v = resolveVillages({})
  assert.equal(v.length, 10)
  const arkham = v.find(x => x.name === 'Arkham') // big, volunteer-heavy: 113 -> 45/68
  assert.deepEqual([arkham.members, arkham.volunteers], [45, 68])
  const quahog = v.find(x => x.name === 'Quahog') // big, memberHeavy: 113 -> 68/45
  assert.deepEqual([quahog.members, quahog.volunteers], [68, 45])
  // most villages volunteer-heavy, 2-3 member-heavy
  const heavy = v.filter(x => x.members > x.volunteers)
  assert.ok(heavy.length >= 2 && heavy.length <= 3, `memberHeavy count ${heavy.length}`)
})

test('sizing: count and name selection', () => {
  assert.deepEqual(resolveVillages({ villages: '3' }).map(x => x.name),
    VILLAGES.slice(0, 3).map(x => x.name))
  assert.deepEqual(resolveVillages({ villages: 'Quahog, Cabinet' }).map(x => x.name),
    ['Quahog', 'Cabinet'])
  assert.throws(() => resolveVillages({ villages: 'Atlantis' }), /unknown village/)
})

test('sizing: uniform overrides bypass the mix', () => {
  const v = resolveVillages({ villages: '3', members: 15, volunteers: 20 })
  for (const x of v) assert.deepEqual([x.members, x.volunteers], [15, 20])
})
