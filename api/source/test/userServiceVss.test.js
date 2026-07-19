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

test('sqlResolvedPersonId is an exported fragment builder', () => {
  assert.equal(typeof dbUtils.sqlResolvedPersonId, 'function')
  const frag = dbUtils.sqlResolvedPersonId('ud.username')
  assert.match(frag, /if\(count\(\*\) = 1, min\(p\.id\), null\)/)
  assert.match(frag, /p\.email = ud\.username/)
})

test('getUserObject sources personId from the shared fragment (no inline copy)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'service', 'UserService.js'), 'utf8')
  // The identity rule must not be hand-written inside UserService anymore.
  assert.equal(
    /if\(count\(\*\) = 1, min\(p\.id\), null\)/.test(src),
    false,
    'inline identity guard still present in UserService.js — must use dbUtils.sqlResolvedPersonId'
  )
  assert.match(src, /dbUtils\.sqlResolvedPersonId\('ud\.username'\)/)
})

test('queryUsers emits isVolunteer built on the shared fragment when volunteer projection requested', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'service', 'UserService.js'), 'utf8')
  // Projection is opt-in and gated on 'volunteer'.
  assert.match(src, /inProjection\?\.includes\('volunteer'\)/)
  // The column is built on the shared fragment, then tested against active_volunteer —
  // not a re-copied identity subquery.
  assert.match(src, /dbUtils\.sqlResolvedPersonId\('ud\.username'\)\} in \(select av\.personId from active_volunteer av\)/)
  // Emits a real JSON boolean aliased isVolunteer.
  assert.match(src, /as json\) as isVolunteer/)
})
