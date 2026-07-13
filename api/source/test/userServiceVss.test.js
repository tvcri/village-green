'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

const UserService = require(path.join('..', 'service', 'UserService'))

test('getVolunteerVillages is exported', () => {
  assert.equal(typeof UserService.getVolunteerVillages, 'function')
})

// Runtime identity (spec §1-AMENDED): personId is computed in getUserObject's
// SELECT; nothing is stored, so the stored-link machinery must not survive.
test('stored-link functions are removed', () => {
  assert.equal(UserService.decideAutoMatch, undefined)
  assert.equal(UserService.attemptPersonAutoMatch, undefined)
  assert.equal(UserService.setUserPersonLink, undefined)
  assert.equal(UserService.deleteUserPersonLink, undefined)
})
