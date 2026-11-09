'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

// verifyEnrollment consumes a correct PIN and then creates the Keycloak
// account. When that creation fails, the volunteer did nothing wrong, so the
// result must not be the same null a wrong PIN produces (VG-202611-518: a
// volunteer was told 11 correct PINs were "not accepted"). Same require-cache
// seam as enrollmentResetCap.test.js — no live database or Keycloak.
const dbUtilsPath = require.resolve('../service/utils')
const bcryptPath = require.resolve('bcryptjs', { paths: [path.join(__dirname, '..', 'service')] })
const kcPath = require.resolve('../service/KeycloakService')
const loggerPath = require.resolve('../utils/logger')
const servicePath = require.resolve('../service/EnrollmentService')

function loadServiceWith({ kc }) {
  for (const p of [dbUtilsPath, bcryptPath, kcPath, loggerPath, servicePath]) delete require.cache[p]

  const queries = []
  const stubDb = {
    pool: {
      query: async (sql, binds) => {
        queries.push({ sql, binds })
        if (/FROM enrollment_request/i.test(sql) && /^\s*SELECT/i.test(sql)) {
          return [[{ id: 42, personId: 7, pinHash: 'goodhash', kind: 'new' }]]
        }
        if (/FROM person/i.test(sql)) return [[{ firstName: 'Robert (Bob)', lastName: 'Example' }]]
        return [{ affectedRows: 1 }]
      },
    },
  }
  require.cache[dbUtilsPath] = { id: dbUtilsPath, filename: dbUtilsPath, loaded: true, exports: stubDb }
  require.cache[bcryptPath] = {
    id: bcryptPath, filename: bcryptPath, loaded: true,
    exports: { compare: async (pin, hash) => pin === 'goodpin' && hash === 'goodhash', hash: async () => 'goodhash' },
  }
  require.cache[kcPath] = { id: kcPath, filename: kcPath, loaded: true, exports: kc }
  require.cache[loggerPath] = {
    id: loggerPath, filename: loggerPath, loaded: true,
    exports: { writeError: () => {}, writeDebug: () => {}, writeInfo: () => {}, writeWarn: () => {} },
  }
  return { svc: require(servicePath), queries }
}

function keycloakError(status) {
  const err = new Error(`Keycloak create-user failed (${status})`)
  err.status = status
  return err
}

const recordsAccountFailed = (queries) =>
  queries.some(q => /UPDATE enrollment_request SET outcome = 'account_failed'/.test(q.sql) && q.binds[0] === 42)

test('a correct PIN whose Keycloak create fails reports setup_failed, not an invalid PIN', async () => {
  const { svc, queries } = loadServiceWith({
    kc: {
      createUser: async () => { throw keycloakError(400) },
      setTemporaryPassword: async () => {},
    },
  })
  const result = await svc.verifyEnrollment('v@example.com', 'goodpin')
  assert.deepEqual(result, { status: 'setup_failed' })
  assert.ok(recordsAccountFailed(queries), 'the row is marked account_failed')
})

test('a 409 recovery whose password reset fails also reports setup_failed', async () => {
  const { svc, queries } = loadServiceWith({
    kc: {
      createUser: async () => { throw keycloakError(409) },
      setTemporaryPassword: async () => { throw keycloakError(404) },
    },
  })
  const result = await svc.verifyEnrollment('v@example.com', 'goodpin')
  assert.deepEqual(result, { status: 'setup_failed' })
  assert.ok(recordsAccountFailed(queries), 'the row is marked account_failed')
})

test('a wrong PIN still returns null and never touches Keycloak', async () => {
  let called = false
  const { svc, queries } = loadServiceWith({
    kc: {
      createUser: async () => { called = true; return 'kc1' },
      setTemporaryPassword: async () => {},
    },
  })
  const result = await svc.verifyEnrollment('v@example.com', 'wrongpin')
  assert.equal(result, null)
  assert.equal(called, false)
  assert.equal(recordsAccountFailed(queries), false)
})

test('a successful create still returns created with a temp password', async () => {
  const { svc, queries } = loadServiceWith({
    kc: {
      createUser: async () => 'kc1',
      setTemporaryPassword: async () => {},
    },
  })
  const result = await svc.verifyEnrollment('v@example.com', 'goodpin')
  assert.equal(result.status, 'created')
  assert.ok(result.tempPassword)
  assert.equal(recordsAccountFailed(queries), false)
})
