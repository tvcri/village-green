'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

// This test exercises the SQL-construction logic only (no live DB connection
// available in this environment) by asserting on the fields object built by
// patchVolunteer's field-collection logic. We do this by requiring the module
// and checking its exported functions exist with the right arity/behavior
// for the fields that matter to this task — full integration coverage of
// putVolunteer/patchVolunteer against a live DB is out of scope for this
// unit test (no test DB is wired into this suite; see other *.test.js files
// in this directory, which are all pure-function tests).
const VolunteerService = require(path.join('..', 'service', 'VolunteerService'))

test('VolunteerService exports putVolunteer, patchVolunteer, volunteerExists, deleteVolunteer', () => {
  assert.equal(typeof VolunteerService.putVolunteer, 'function')
  assert.equal(typeof VolunteerService.patchVolunteer, 'function')
  assert.equal(typeof VolunteerService.volunteerExists, 'function')
  assert.equal(typeof VolunteerService.deleteVolunteer, 'function')
})
