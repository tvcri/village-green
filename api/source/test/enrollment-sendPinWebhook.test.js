'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

// Resolve the exact module paths EnrollmentService requires, so we can seed
// the require cache with mocks before loading it.
const undiciPath = require.resolve('undici', { paths: [path.join(__dirname, '..', 'service')] })
const configPath = require.resolve('../utils/config')
const loggerPath = require.resolve('../utils/logger')
const servicePath = require.resolve('../service/EnrollmentService')

let fetchCalls
let errorLogs

function loadServiceWith({ sidecarKey }) {
  // Fresh module graph each load.
  for (const p of [undiciPath, configPath, loggerPath, servicePath]) delete require.cache[p]

  fetchCalls = []
  errorLogs = []

  require.cache[undiciPath] = {
    id: undiciPath, filename: undiciPath, loaded: true,
    exports: { fetch: async (url, opts) => { fetchCalls.push({ url, opts }); return { ok: true, status: 202 } } },
  }
  const realConfig = require(configPath) // load real, then override the branch under test
  realConfig.enrollment = { ...realConfig.enrollment, sidecarUrl: 'http://sidecar.test/internal/send-pin', sidecarKey }
  require.cache[loggerPath] = {
    id: loggerPath, filename: loggerPath, loaded: true,
    exports: { writeError: (c, cat, detail) => { errorLogs.push({ c, cat, detail }) }, writeDebug: () => {}, writeInfo: () => {}, writeWarn: () => {} },
  }
  return require(servicePath)
}

test('sendPinWebhook attaches the bearer when the key is set', async () => {
  const svc = loadServiceWith({ sidecarKey: 'shhh' })
  svc.sendPinWebhook({ email: 'v@x.com', pin: '424242', firstName: 'Jane', kind: 'new' })
  await new Promise((r) => setImmediate(r)) // let the fire-and-forget .then run
  assert.equal(fetchCalls.length, 1)
  assert.equal(fetchCalls[0].opts.headers.Authorization, 'Bearer shhh')
  assert.equal(errorLogs.length, 0)
})

test('sendPinWebhook skips the POST and logs an error when the key is unset', async () => {
  const svc = loadServiceWith({ sidecarKey: undefined })
  svc.sendPinWebhook({ email: 'v@x.com', pin: '424242', firstName: 'Jane', kind: 'new' })
  await new Promise((r) => setImmediate(r))
  assert.equal(fetchCalls.length, 0, 'POST must be skipped when key unset')
  assert.equal(errorLogs.length, 1, 'a skip must be logged')
})
