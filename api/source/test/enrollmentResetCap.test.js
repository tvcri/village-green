'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

// resetEnrollmentPassword's brute-force guard lives in SQL (the reset SELECT's
// `resetAttempts < ?` predicate) plus a pre-compare increment. Both are DB
// interactions, so we stub dbUtils.pool.query via the require-cache seam (same
// approach as enrollment-sendPinWebhook.test.js) and drive the function
// directly — no live database.
const dbUtilsPath = require.resolve('../service/utils')
const bcryptPath = require.resolve('bcryptjs', { paths: [path.join(__dirname, '..', 'service')] })
const kcPath = require.resolve('../service/KeycloakService')
const loggerPath = require.resolve('../utils/logger')
const servicePath = require.resolve('../service/EnrollmentService')

// A scripted query stub: `rows` is the result the SELECT should return, and
// every call is recorded so we can inspect the SQL and bind order.
function loadServiceWith({ selectRows }) {
  for (const p of [dbUtilsPath, bcryptPath, kcPath, loggerPath, servicePath]) delete require.cache[p]

  const queries = []
  const stubDb = {
    pool: {
      query: async (sql, binds) => {
        queries.push({ sql, binds })
        // The reset SELECT is the only read; UPDATEs return an OK-packet shape.
        if (/^\s*SELECT/i.test(sql)) return [selectRows]
        return [{ affectedRows: 1 }]
      },
    },
  }
  require.cache[dbUtilsPath] = { id: dbUtilsPath, filename: dbUtilsPath, loaded: true, exports: stubDb }

  // bcrypt.compare: 'goodpin' matches the stored hash, anything else fails.
  require.cache[bcryptPath] = {
    id: bcryptPath, filename: bcryptPath, loaded: true,
    exports: { compare: async (pin, hash) => pin === 'goodpin' && hash === 'goodhash', hash: async () => 'goodhash' },
  }
  require.cache[kcPath] = {
    id: kcPath, filename: kcPath, loaded: true,
    exports: { setTemporaryPassword: async () => {}, findUserByUsername: async () => ({ id: 'kc1' }) },
  }
  require.cache[loggerPath] = {
    id: loggerPath, filename: loggerPath, loaded: true,
    exports: { writeError: () => {}, writeDebug: () => {}, writeInfo: () => {}, writeWarn: () => {} },
  }
  return { svc: require(servicePath), queries }
}

test('reset SELECT guards on resetAttempts < cap and passes the cap as a bind', async () => {
  const { svc, queries } = loadServiceWith({ selectRows: [{ id: 7, pinHash: 'goodhash' }] })
  await svc.resetEnrollmentPassword('v@x.com', 'goodpin')
  const select = queries.find(q => /^\s*SELECT/i.test(q.sql))
  assert.match(select.sql, /resetAttempts < \?/, 'reset SELECT must cap on resetAttempts')
  // binds: [email, RESET_WINDOW_MINUTES, ATTEMPT_CAP]
  assert.equal(select.binds[0], 'v@x.com')
  assert.equal(select.binds[2], 5, 'the attempt cap (5) is bound')
})

test('reset increments resetAttempts before comparing the PIN (failing caller burns budget)', async () => {
  // A wrong PIN must still cost an attempt: the increment UPDATE has to run
  // before bcrypt.compare short-circuits the function.
  const { svc, queries } = loadServiceWith({ selectRows: [{ id: 7, pinHash: 'goodhash' }] })
  const result = await svc.resetEnrollmentPassword('v@x.com', 'wrongpin')
  assert.equal(result, null, 'a wrong PIN returns null')
  const incremented = queries.some(q => /resetAttempts = resetAttempts \+ 1/.test(q.sql) && q.binds[0] === 7)
  assert.ok(incremented, 'resetAttempts must be incremented even for a failed compare')
})

test('reset returns null when the capped row is excluded by the SELECT', async () => {
  // Once resetAttempts has reached the cap the SELECT returns no row, so even a
  // correct PIN cannot proceed — the brute-force budget is exhausted.
  const { svc } = loadServiceWith({ selectRows: [] })
  const result = await svc.resetEnrollmentPassword('v@x.com', 'goodpin')
  assert.equal(result, null, 'no eligible row → null, regardless of PIN')
})

test('reset succeeds and stamps resetAt for a good PIN under the cap', async () => {
  const { svc, queries } = loadServiceWith({ selectRows: [{ id: 7, pinHash: 'goodhash' }] })
  const result = await svc.resetEnrollmentPassword('v@x.com', 'goodpin')
  assert.equal(result.status, 'reset')
  assert.match(result.tempPassword, /^[A-Za-z0-9_-]{12}$/)
  const stamped = queries.some(q => /resetAt = NOW\(\)/.test(q.sql) && q.binds[0] === 7)
  assert.ok(stamped, 'a successful reset stamps resetAt for single-use')
})
