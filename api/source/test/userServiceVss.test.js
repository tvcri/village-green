'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const fs = require('node:fs')

const UserService = require(path.join('..', 'service', 'UserService'))
const dbUtils = require(path.join('..', 'service', 'utils'))

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

// Multi-volunteer accounts (spec 2026-07-21): the exactly-one resolver is
// replaced by a set resolver; ambiguous (2+) matches are now valid identities.
test('sqlResolvedPersonId (exactly-one form) is removed', () => {
  assert.equal(dbUtils.sqlResolvedPersonId, undefined)
})

test('sqlResolvedPersonIds is an exported fragment builder returning a JSON id array', () => {
  assert.equal(typeof dbUtils.sqlResolvedPersonIds, 'function')
  const frag = dbUtils.sqlResolvedPersonIds('ud.username')
  assert.match(frag, /coalesce\(group_concat\(p\.id\), ''\)/)
  assert.match(frag, /as json/)
  assert.match(frag, /p\.email = ud\.username/)
})

test('sqlIsActiveVolunteerForUsername is an exported ANY-volunteer predicate', () => {
  assert.equal(typeof dbUtils.sqlIsActiveVolunteerForUsername, 'function')
  const frag = dbUtils.sqlIsActiveVolunteerForUsername('ud.username')
  assert.match(frag, /exists/)
  assert.match(frag, /active_volunteer av on av\.personId = p\.id/)
  assert.match(frag, /p\.email = ud\.username/)
})

test('getUserObject sources personIds from the shared fragment (no inline copy)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'service', 'UserService.js'), 'utf8')
  assert.equal(
    /group_concat\(p\.id\)/.test(src),
    false,
    'inline identity SQL in UserService.js — must use dbUtils.sqlResolvedPersonIds'
  )
  assert.match(src, /dbUtils\.sqlResolvedPersonIds\('ud\.username'\)/)
})

test('queryUsers emits isVolunteer built on the shared any-volunteer fragment', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'service', 'UserService.js'), 'utf8')
  assert.match(src, /inProjection\?\.includes\('volunteer'\)/)
  assert.match(src, /dbUtils\.sqlIsActiveVolunteerForUsername\('ud\.username'\)/)
  assert.match(src, /as json\) as isVolunteer/)
})
