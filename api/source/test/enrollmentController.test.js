'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')

// The verify controller maps service results to HTTP. A failed account setup
// after a correct PIN must reach the client as its own status, never as the
// 400 'invalid' a wrong PIN gets (VG-202611-518).
const servicePath = require.resolve('../service/EnrollmentService')
const controllerPath = require.resolve('../controllers/Enrollment')

function loadControllerWith(verifyResult) {
  delete require.cache[controllerPath]
  require.cache[servicePath] = {
    id: servicePath, filename: servicePath, loaded: true,
    exports: { verifyEnrollment: async () => verifyResult },
  }
  return require(controllerPath)
}

function fakeRes() {
  const res = { statusCode: 200, body: undefined }
  res.status = (code) => { res.statusCode = code; return res }
  res.json = (body) => { res.body = body; return res }
  return res
}

const req = { body: { email: 'v@example.com', pin: '123456' } }

test('verify responds 502 setup_failed when the account could not be set up', async () => {
  const controller = loadControllerWith({ status: 'setup_failed' })
  const res = fakeRes()
  await controller.verifyEnrollment(req, res, (err) => { throw err })
  assert.equal(res.statusCode, 502)
  assert.deepEqual(res.body, { status: 'setup_failed' })
})

test('verify still responds 400 invalid for a wrong PIN', async () => {
  const controller = loadControllerWith(null)
  const res = fakeRes()
  await controller.verifyEnrollment(req, res, (err) => { throw err })
  assert.equal(res.statusCode, 400)
  assert.deepEqual(res.body, { status: 'invalid' })
})
