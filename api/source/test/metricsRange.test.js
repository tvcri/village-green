'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { resolveMetricsRange } = require('../utils/metricsRange')
const SmError = require('../utils/error')

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
