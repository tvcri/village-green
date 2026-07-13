'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { resolveMetricsRange, todayCivil } = require('../utils/metricsRange')
const SmError = require('../utils/error')

test('todayCivil formats as YYYY-MM-DD', () => {
  assert.match(todayCivil('America/New_York'), /^\d{4}-\d{2}-\d{2}$/)
})

test('todayCivil resolves the civil day in the given zone, not UTC', () => {
  // A fixed instant that straddles the date line between zones:
  // 2026-07-13T02:30:00Z is still 2026-07-12 in America/New_York (22:30 EDT).
  const instant = new Date('2026-07-13T02:30:00Z')
  const fmt = tz => instant.toLocaleDateString('en-CA', { timeZone: tz })
  assert.equal(fmt('UTC'), '2026-07-13')
  assert.equal(fmt('America/New_York'), '2026-07-12')
})

test('returns start and end unchanged when both given and ordered', () => {
  assert.deepEqual(
    resolveMetricsRange('2026-01-01', '2026-06-30', '2026-07-12'),
    { start: '2026-01-01', end: '2026-06-30' }
  )
})

test('defaults end to today when end is undefined', () => {
  assert.deepEqual(
    resolveMetricsRange('2026-01-01', undefined, '2026-07-12'),
    { start: '2026-01-01', end: '2026-07-12' }
  )
})

test('start equal to end is valid (single-day range)', () => {
  assert.deepEqual(
    resolveMetricsRange('2026-07-12', '2026-07-12', '2026-07-12'),
    { start: '2026-07-12', end: '2026-07-12' }
  )
})

test('throws ClientError when start > end', () => {
  assert.throws(
    () => resolveMetricsRange('2026-07-01', '2026-06-30', '2026-07-12'),
    SmError.ClientError
  )
})

test('throws ClientError when start > defaulted end', () => {
  assert.throws(
    () => resolveMetricsRange('2027-01-01', undefined, '2026-07-12'),
    SmError.ClientError
  )
})
