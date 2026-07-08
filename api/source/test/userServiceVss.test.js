'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

const UserService = require(path.join('..', 'service', 'UserService'))

test('decideAutoMatch links only on exactly one candidate', () => {
  assert.equal(UserService.decideAutoMatch([{ id: 7 }]), 7)
  assert.equal(UserService.decideAutoMatch([]), null)
  assert.equal(UserService.decideAutoMatch([{ id: 7 }, { id: 8 }]), null)
})

test('VSS identity functions are exported', () => {
  assert.equal(typeof UserService.attemptPersonAutoMatch, 'function')
  assert.equal(typeof UserService.getVolunteerVillages, 'function')
})
