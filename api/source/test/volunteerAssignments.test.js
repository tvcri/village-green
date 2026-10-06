'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const va = require('../service/volunteerAssignments')

// Ids arrive from the API as strings and from mysql2 as numbers; keys must
// treat '7' and 7 as the same id or every save would churn every row.
test('keys normalize ids and missing optionals', () => {
  assert.equal(va.trainingKey({ trainingId: 7 }), va.trainingKey({ trainingId: '7', completedDate: null }))
  assert.equal(va.positionKey({ positionId: '3', villageId: 2 }), va.positionKey({ positionId: 3, villageId: '2', circleId: null }))
  assert.notEqual(va.positionKey({ positionId: 3, villageId: 2 }), va.positionKey({ positionId: 3, circleId: 2 }))
})

test('findDuplicateKeys reports each repeated key once', () => {
  const items = [{ trainingId: '1' }, { trainingId: 1, completedDate: null }, { trainingId: '1', completedDate: '2026-01-01' }]
  assert.deepEqual(va.findDuplicateKeys(items, va.trainingKey), [va.trainingKey({ trainingId: 1 })])
})

test('diffTrainings: unchanged rows are untouched, notes edits update in place, date edits are remove+add', () => {
  const current = [
    { id: 10, trainingId: 1, completedDate: '2025-03-01', notes: 'email from Gabriella' },
    { id: 11, trainingId: 1, completedDate: '2026-03-01', notes: null },
    { id: 12, trainingId: 2, completedDate: null, notes: null },
  ]
  const requested = [
    { trainingId: '1', completedDate: '2025-03-01', notes: 'email from Gabriella' }, // unchanged
    { trainingId: '1', completedDate: '2026-03-01', notes: 'refresher' },            // notes edit
    { trainingId: '2', completedDate: '2026-05-05' },                                // date edit of 12
  ]
  const d = va.diffTrainings(current, requested)
  assert.deepEqual(d.update, [{ id: 11, notes: 'refresher' }])
  assert.deepEqual(d.remove.map(r => r.id), [12])
  assert.deepEqual(d.add, [{ trainingId: '2', completedDate: '2026-05-05' }])
})

test('diffTrainings: empty notes and missing notes both mean null', () => {
  const current = [{ id: 1, trainingId: 1, completedDate: null, notes: null }]
  const d = va.diffTrainings(current, [{ trainingId: '1', completedDate: null, notes: '' }])
  assert.deepEqual(d, { add: [], remove: [], update: [] })
})

test('diffPositions: re-sending the stored set is a no-op', () => {
  const current = [{ id: 5, positionId: 3, villageId: 2, circleId: null }]
  assert.deepEqual(va.diffPositions(current, [{ positionId: '3', villageId: '2' }]), { add: [], remove: [] })
  const d = va.diffPositions(current, [{ positionId: '3', villageId: '4' }])
  assert.deepEqual(d.remove.map(r => r.id), [5])
  assert.equal(d.add.length, 1)
})

test('scopeShapeError enforces the scope/id pairing', () => {
  assert.equal(va.scopeShapeError({ positionId: 1, villageId: '2' }, 'village'), null)
  assert.match(va.scopeShapeError({ positionId: 1 }, 'village'), /needs a village/)
  assert.match(va.scopeShapeError({ positionId: 1, villageId: '2', circleId: '1' }, 'village'), /no circle/)
  assert.equal(va.scopeShapeError({ positionId: 1, circleId: '1' }, 'circle'), null)
  assert.match(va.scopeShapeError({ positionId: 1, villageId: '2' }, 'circle'), /needs a circle/)
  assert.equal(va.scopeShapeError({ positionId: 1 }, 'federation'), null)
  assert.match(va.scopeShapeError({ positionId: 1, villageId: '2' }, 'federation'), /no village or circle/)
})

test('isEligible: village scope needs the home village or an associate village; other scopes always qualify', () => {
  const ctx = { homeVillageId: 4, associateVillageIds: ['1'] }
  assert.equal(va.isEligible({ villageId: '4' }, 'village', ctx), true)
  assert.equal(va.isEligible({ villageId: 1 }, 'village', ctx), true)
  assert.equal(va.isEligible({ villageId: '2' }, 'village', ctx), false)
  assert.equal(va.isEligible({ villageId: '2' }, 'village', { homeVillageId: null, associateVillageIds: [] }), false)
  assert.equal(va.isEligible({}, 'federation', { homeVillageId: null, associateVillageIds: [] }), true)
  assert.equal(va.isEligible({ circleId: '1' }, 'circle', ctx), true)
})
