'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { catalog, WILDCARD, elevatable, keys } = require('../utils/permissions')

test('catalog keys are domain:action format', () => {
  for (const key of keys) {
    assert.match(key, /^[a-z]+:[a-z_]+$/, `bad key format: ${key}`)
  }
})

test('wildcard is not a catalog entry', () => {
  assert.equal(catalog[WILDCARD], undefined)
})

test('elevation-flagged permissions are exactly the admin tier', () => {
  assert.deepEqual(
    [...elevatable].sort(),
    ['app:admin', 'grant:admin', 'user:admin', 'village:create']
  )
})

test('expected non-elevated permissions exist', () => {
  for (const key of [
    'person:read', 'person:write', 'person:read_confidential',
    'member:read', 'member:write', 'member:read_financial',
    'volunteer:read', 'volunteer:write',
    'sr:read', 'sr:write', 'friend:read', 'friend:write',
    'village:read', 'village:write',
  ]) {
    assert.ok(catalog[key], `missing ${key}`)
    assert.equal(catalog[key].requiresElevation, false)
  }
})
