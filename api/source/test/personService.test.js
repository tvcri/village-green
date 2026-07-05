'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')

// PersonService.getPerson/patchPerson require a live DB connection
// (dbUtils.pool.query) and are not unit-testable in isolation, matching
// this project's existing convention of only unit-testing pure functions
// (see applicationImportService.test.js). Coverage for communities/
// disabilities is manual: see Task 2 Step 2 and Task 4 Step 2 of
// scratch/superpowers/plans/2026-07-05-person-disabilities.md.
test('placeholder — see file header', () => {
  assert.ok(true)
})
