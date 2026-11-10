'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { civilYearsAgo } = require('../utils/civilDate')

test('civilYearsAgo subtracts whole years', () => {
  assert.equal(civilYearsAgo('2026-11-09', 5), '2021-11-09')
})

test('civilYearsAgo clamps Feb 29 to Feb 28 when the target year is not a leap year', () => {
  assert.equal(civilYearsAgo('2028-02-29', 1), '2027-02-28')
})

test('civilYearsAgo keeps Feb 29 when the target year is a leap year', () => {
  assert.equal(civilYearsAgo('2028-02-29', 4), '2024-02-29')
})
