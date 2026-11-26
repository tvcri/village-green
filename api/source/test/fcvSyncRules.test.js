'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { holdSubjectKey, validateSubmission, validateResolution } = require('../service/fcvSyncRules')

const unprocessable = (e) => e.status === 422
const ok = { visitDate: '2026-01-02', timeSpentMinutes: 30, contactType: 'phone' }

test('holdSubjectKey: name holds', () => {
  assert.equal(holdSubjectKey({ kind: 'name', role: 'volunteer', villageId: '3', nameKey: 'jane doe' }), 'name:volunteer:3:jane doe')
  assert.equal(holdSubjectKey({ kind: 'name', role: 'volunteer', villageId: null, nameKey: 'jane doe' }), 'name:volunteer:0:jane doe')
  assert.equal(holdSubjectKey({ kind: 'name', role: 'member', nameKey: 'jane doe' }), 'name:member:0:jane doe')
})

test('holdSubjectKey: date and unreadable holds', () => {
  assert.equal(holdSubjectKey({ kind: 'date', submissionId: '6001' }), 'date:6001')
  assert.equal(holdSubjectKey({ kind: 'unreadable', submissionId: 6001 }), 'unreadable:6001')
})

test('holdSubjectKey: unknown kind or missing fields throw 422', () => {
  assert.throws(() => holdSubjectKey({ kind: 'other' }), unprocessable)
  assert.throws(() => holdSubjectKey(null), unprocessable)
  assert.throws(() => holdSubjectKey({ kind: 'name', villageId: '3', nameKey: 'x' }), unprocessable)
  assert.throws(() => holdSubjectKey({ kind: 'name', role: 'member', villageId: '3' }), unprocessable)
  assert.throws(() => holdSubjectKey({ kind: 'date' }), unprocessable)
})

test('validateSubmission: strips dateDecision*, unknown keys; absent keys become null', () => {
  const row = validateSubmission({ ...ok, held: 'date', dateDecision: 'accept', dateDecidedAt: 'x', dateDecidedUserId: 1, bogus: 1, villageId: '3' }, '6001')
  assert.equal('dateDecision' in row, false)
  assert.equal('dateDecidedAt' in row, false)
  assert.equal('dateDecidedUserId' in row, false)
  assert.equal('bogus' in row, false)
  assert.equal(row.held, 'date')
  assert.equal(row.villageId, '3')
  assert.equal(row.notes, null)
  assert.equal(row.id, '6001')
  assert.equal(Object.keys(row).length, 24)
})

test('validateSubmission: body.id must equal the path id', () => {
  assert.equal(validateSubmission({ ...ok, id: '6001' }, '6001').id, '6001')
  assert.throws(() => validateSubmission({ ...ok, id: '6002' }, '6001'), unprocessable)
})

test('validateSubmission: held and match enums', () => {
  for (const h of [null, 'name', 'date', 'ignored', 'unreadable']) assert.equal(validateSubmission({ ...ok, held: h }, '1').held, h)
  for (const m of [null, 'remembered', 'email', 'name-village', 'name-elsewhere']) {
    assert.equal(validateSubmission({ ...ok, volunteerMatch: m, memberMatch: m }, '1').memberMatch, m)
  }
  assert.throws(() => validateSubmission({ ...ok, held: 'maybe' }, '6001'), unprocessable)
  assert.throws(() => validateSubmission({ ...ok, volunteerMatch: 'fuzzy' }, '6001'), unprocessable)
  assert.throws(() => validateSubmission({ ...ok, memberMatch: 'fuzzy' }, '6001'), unprocessable)
})

test('validateSubmission: activityTypes is an array of strings or null', () => {
  assert.deepEqual(validateSubmission({ ...ok, activityTypes: ['a', 'b'] }, '1').activityTypes, ['a', 'b'])
  assert.equal(validateSubmission({ ...ok, activityTypes: null }, '1').activityTypes, null)
  assert.throws(() => validateSubmission({ ...ok, activityTypes: 'a' }, '1'), unprocessable)
  assert.throws(() => validateSubmission({ ...ok, activityTypes: [1] }, '1'), unprocessable)
})

test('validateSubmission: ids are strings or null; body must be an object', () => {
  assert.throws(() => validateSubmission({ ...ok, villageId: {} }, '1'), unprocessable)
  assert.throws(() => validateSubmission({ ...ok, volunteerPersonId: [] }, '1'), unprocessable)
  assert.throws(() => validateSubmission(null, '1'), unprocessable)
  assert.throws(() => validateSubmission([], '1'), unprocessable)
})

test('validateResolution: name hold', () => {
  assert.deepEqual(validateResolution({ kind: 'name' }, { personId: '5' }), { kind: 'match', personId: '5' })
  assert.deepEqual(validateResolution({ kind: 'name' }, { ignore: true }), { kind: 'ignore' })
  assert.throws(() => validateResolution({ kind: 'name' }, {}), unprocessable)
  assert.throws(() => validateResolution({ kind: 'name' }, { accept: true }), unprocessable)
  assert.throws(() => validateResolution({ kind: 'name' }, { personId: '5', ignore: true }), unprocessable)
  assert.throws(() => validateResolution({ kind: 'name' }, { personId: '' }), unprocessable)
  assert.throws(() => validateResolution({ kind: 'name' }, null), unprocessable)
})

test('validateResolution: date hold', () => {
  assert.deepEqual(validateResolution({ kind: 'date' }, { accept: true }), { kind: 'accept' })
  assert.deepEqual(validateResolution({ kind: 'date' }, { ignore: true }), { kind: 'ignore' })
  assert.throws(() => validateResolution({ kind: 'date' }, { personId: '5' }), unprocessable)
  assert.throws(() => validateResolution({ kind: 'date' }, { accept: true, ignore: true }), unprocessable)
  assert.throws(() => validateResolution({ kind: 'date' }, { accept: false }), unprocessable)
})

test('validateResolution: unreadable and unknown holds take nothing', () => {
  assert.throws(() => validateResolution({ kind: 'unreadable' }, { ignore: true }), unprocessable)
  assert.throws(() => validateResolution({ kind: 'unreadable' }, {}), unprocessable)
  assert.throws(() => validateResolution({ kind: 'zzz' }, { ignore: true }), unprocessable)
})

test('validateSubmission: visitDate, timeSpentMinutes, contactType are required unless held unreadable', () => {
  for (const col of ['visitDate', 'timeSpentMinutes', 'contactType']) {
    assert.throws(() => validateSubmission({ ...ok, [col]: null }, '1'), unprocessable)
    assert.throws(() => validateSubmission({ ...ok, [col]: null, held: 'date' }, '1'), unprocessable)
    assert.equal(validateSubmission({ ...ok, [col]: null, held: 'unreadable' }, '1')[col], null)
  }
  assert.throws(() => validateSubmission({}, '1'), unprocessable)
  assert.equal(validateSubmission({ held: 'unreadable' }, '1').visitDate, null)
})

test('validateSubmission: timeSpentMinutes is 0 or more', () => {
  assert.equal(validateSubmission({ ...ok, timeSpentMinutes: 0 }, '1').timeSpentMinutes, 0)
  assert.throws(() => validateSubmission({ ...ok, timeSpentMinutes: -1 }, '1'), unprocessable)
  assert.throws(() => validateSubmission({ held: 'unreadable', timeSpentMinutes: -5 }, '1'), unprocessable)
})
