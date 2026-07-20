'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

// requestEnrollment must supersede any prior live PIN before inserting a new
// one, so exactly one unconsumed 'pin_sent' row exists per email. Both the
// supersede and the insert are DB writes, so we stub dbUtils.pool.query via the
// require-cache seam (as enrollment-sendPinWebhook.test.js does) and drive the
// volunteer path — no live database.
const dbUtilsPath = require.resolve('../service/utils')
const bcryptPath = require.resolve('bcryptjs', { paths: [path.join(__dirname, '..', 'service')] })
const kcPath = require.resolve('../service/KeycloakService')
const undiciPath = require.resolve('undici', { paths: [path.join(__dirname, '..', 'service')] })
const configPath = require.resolve('../utils/config')
const loggerPath = require.resolve('../utils/logger')
const servicePath = require.resolve('../service/EnrollmentService')

function loadService({ eligibilityRows }) {
  for (const p of [dbUtilsPath, bcryptPath, kcPath, undiciPath, configPath, loggerPath, servicePath]) {
    delete require.cache[p]
  }
  const queries = []
  const stubDb = {
    pool: {
      query: async (sql, binds) => {
        queries.push({ sql, binds })
        // getEligibility is the only SELECT on the volunteer path.
        if (/^\s*SELECT/i.test(sql)) return [eligibilityRows]
        return [{ affectedRows: 1 }]
      },
    },
  }
  require.cache[dbUtilsPath] = { id: dbUtilsPath, filename: dbUtilsPath, loaded: true, exports: stubDb }
  require.cache[bcryptPath] = {
    id: bcryptPath, filename: bcryptPath, loaded: true,
    exports: { hash: async () => 'newhash', compare: async () => false },
  }
  require.cache[kcPath] = {
    id: kcPath, filename: kcPath, loaded: true,
    exports: { findUserByUsername: async () => null }, // → kind 'new'
  }
  require.cache[undiciPath] = {
    id: undiciPath, filename: undiciPath, loaded: true,
    exports: { fetch: async () => ({ ok: true, status: 202 }) },
  }
  const realConfig = require(configPath)
  realConfig.enrollment = { ...realConfig.enrollment, sidecarUrl: 'http://sidecar.test/send-pin', sidecarKey: 'k' }
  require.cache[loggerPath] = {
    id: loggerPath, filename: loggerPath, loaded: true,
    exports: { writeError: () => {}, writeDebug: () => {}, writeInfo: () => {}, writeWarn: () => {} },
  }
  return { svc: require(servicePath), queries }
}

const VOLUNTEER = [{ id: 42, firstName: 'Vol', isVolunteer: 1, isMember: 0 }]

test('requestEnrollment supersedes prior live PINs before inserting the new one', async () => {
  const { svc, queries } = loadService({ eligibilityRows: VOLUNTEER })
  await svc.requestEnrollment('v@x.com')

  const supersedeIdx = queries.findIndex(q => /SET outcome = 'superseded'/.test(q.sql))
  const insertIdx = queries.findIndex(q => /INSERT INTO enrollment_request/.test(q.sql))

  assert.ok(supersedeIdx !== -1, 'a supersede UPDATE must run')
  assert.ok(insertIdx !== -1, 'the new pin_sent row must be inserted')
  assert.ok(supersedeIdx < insertIdx, 'supersede must run BEFORE the insert')
})

test('supersede targets only this email and only unconsumed pin_sent rows', async () => {
  const { svc, queries } = loadService({ eligibilityRows: VOLUNTEER })
  await svc.requestEnrollment('v@x.com')

  const supersede = queries.find(q => /SET outcome = 'superseded'/.test(q.sql))
  assert.match(supersede.sql, /outcome = 'pin_sent'/, 'only pin_sent rows')
  assert.match(supersede.sql, /consumedAt IS NULL/, 'only unconsumed rows (spare the reset gate)')
  assert.equal(supersede.binds[0], 'v@x.com', 'scoped to the requesting email')
})

test('non-volunteer paths never supersede (no PIN is issued)', async () => {
  const { svc, queries } = loadService({
    eligibilityRows: [{ id: 9, firstName: 'X', isVolunteer: 0, isMember: 0 }], // not_found
  })
  await svc.requestEnrollment('nobody@x.com')
  assert.ok(
    !queries.some(q => /SET outcome = 'superseded'/.test(q.sql)),
    'a not_found audit row must not trigger a supersede'
  )
})
