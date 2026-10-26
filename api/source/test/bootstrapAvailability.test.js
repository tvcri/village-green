'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')

// The API must not report `available` until initializeDependencies() has run
// its one-time boot checks (audit shape validation, bootstrap admin), even
// though db and oidc flip true earlier, inside its Promise.all. A boot-check
// failure must read starting -> fail, never available -> fail.
//
// Drives the real state module and dependencies.js, with auth, db, audit,
// UserService, config and logger stubbed through the require cache.
const statePath = require.resolve('../utils/state')
const depsPath = require.resolve('../bootstrap/dependencies')
const authPath = require.resolve('../utils/auth')
const dbPath = require.resolve('../service/utils')
const userPath = require.resolve('../service/UserService')
const auditPath = require.resolve('../service/audit/AuditService')
const configPath = require.resolve('../utils/config')
const loggerPath = require.resolve('../utils/logger')

const quietLogger = { writeError: () => {}, writeWarn: () => {}, writeInfo: () => {}, writeDebug: () => {} }
const stub = (p, exports) => { require.cache[p] = { id: p, filename: p, loaded: true, exports } }

function freshState () {
  delete require.cache[statePath]
  stub(loggerPath, quietLogger)
  const state = require(statePath)
  const transitions = []
  state.on('state-changed', (current, previous) => transitions.push(`${previous}->${current}`))
  return { state, transitions }
}

function loadBoot ({ validateShapes = async () => {}, bootstrapAdmin, ensureBootstrapAdmin = async () => {} } = {}) {
  for (const p of [depsPath, authPath, dbPath, userPath, auditPath, configPath]) delete require.cache[p]
  const { state, transitions } = freshState()
  const seen = {}
  stub(authPath, { initializeAuth: async () => { state.setOidcStatus(true) } })
  stub(dbPath, { initializeDatabase: async () => { state.setDbStatus(true) } })
  stub(auditPath, { validateShapes: async () => { seen.duringShapes = state.currentState; return validateShapes() } })
  stub(userPath, { ensureBootstrapAdmin: async (u) => { seen.duringAdmin = state.currentState; return ensureBootstrapAdmin(u) } })
  stub(configPath, { settings: { bootstrapAdmin } })
  const { initializeDependencies } = require(depsPath)
  return { state, transitions, seen, initializeDependencies }
}

test('available waits until audit shapes and bootstrap admin have run', async () => {
  const { state, transitions, seen, initializeDependencies } = loadBoot({ bootstrapAdmin: 'admin' })
  await initializeDependencies()
  assert.equal(seen.duringShapes, 'starting')
  assert.equal(seen.duringAdmin, 'starting')
  assert.equal(state.currentState, 'available')
  assert.deepEqual(transitions, ['starting->available'])
})

test('a failed boot check reads starting -> fail, never available -> fail', async (t) => {
  // The state module exits the process on 'fail'.
  const exit = t.mock.method(process, 'exit', () => {})
  const { state, transitions, initializeDependencies } = loadBoot({
    validateShapes: async () => { throw new Error('shape mismatch') },
  })
  await initializeDependencies()
  assert.equal(state.currentState, 'fail')
  assert.deepEqual(transitions, ['starting->fail'])
  assert.equal(exit.mock.callCount(), 1)
})

test('a failed bootstrap admin also reads starting -> fail', async (t) => {
  t.mock.method(process, 'exit', () => {})
  const { transitions, initializeDependencies } = loadBoot({
    bootstrapAdmin: 'admin',
    ensureBootstrapAdmin: async () => { throw new Error('no such user') },
  })
  await initializeDependencies()
  assert.deepEqual(transitions, ['starting->fail'])
})

test('dependency flips alone leave the API starting', () => {
  const { state, transitions } = freshState()
  state.setDbStatus(true)
  state.setOidcStatus(true)
  assert.equal(state.currentState, 'starting')
  assert.deepEqual(transitions, [])
})

test('boot completing before the dependencies are up stays starting until they are', () => {
  const { state, transitions } = freshState()
  state.setBootComplete()
  assert.equal(state.currentState, 'starting')
  state.setDbStatus(true)
  assert.equal(state.currentState, 'starting')
  state.setOidcStatus(true)
  assert.deepEqual(transitions, ['starting->available'])
})

test('after boot, available still follows the volatile dependencies both ways', () => {
  const { state, transitions } = freshState()
  state.setDbStatus(true)
  state.setOidcStatus(true)
  state.setBootComplete()
  state.setDbStatus(false)
  assert.equal(state.currentState, 'unavailable')
  state.setDbStatus(true)
  state.setOidcStatus(false)
  state.setOidcStatus(true)
  assert.deepEqual(transitions, [
    'starting->available', 'available->unavailable', 'unavailable->available',
    'available->unavailable', 'unavailable->available',
  ])
  // dependencies and the served state shape are unchanged: no boot key.
  assert.deepEqual(state.dependencyStatus, { db: true, oidc: true })
  assert.deepEqual(Object.keys(state.apiState), ['currentState', 'since', 'dependencies', 'endpoints'])
})
