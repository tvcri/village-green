'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const SmError = require('../utils/error')

// The HTTP status carried by each error class is what the error middleware
// maps onto responses — pin them all in one table.
const statuses = {
  ClientError: 400,
  AuthorizeError: 401,
  SigningKeyNotFoundError: 401,
  InsecureTokenError: 401,
  NoTokenError: 401,
  UnauthorizedError: 401,
  PrivilegeError: 403,
  PrivacyAckRequiredError: 403,
  OutOfScopeError: 403,
  ElevationError: 403,
  InvalidElevationError: 403,
  UserUnavailableError: 403,
  NotFoundError: 404,
  EndpointUnavailableError: 409,
  ModeLockedError: 409,
  UnprocessableError: 422,
  UserInconsistentError: 422,
  InternalError: 500,
  OIDCProviderError: 503,
}

test('every exported error class carries its expected HTTP status', () => {
  const exported = Object.keys(SmError).filter(k => k !== 'SmError')
  assert.deepEqual(exported.sort(), Object.keys(statuses).sort())
  for (const [name, status] of Object.entries(statuses)) {
    const err = name === 'InternalError'
      ? new SmError[name](new Error('boom'))
      : new SmError[name]('some detail')
    assert.equal(err.status, status, name)
    assert.equal(err.name, name)
    assert.ok(err instanceof SmError.SmError, name)
  }
})

test('detail passes through and toJSON exposes only the message', () => {
  const err = new SmError.NotFoundError({ villageId: 3 })
  assert.deepEqual(err.detail, { villageId: 3 })
  assert.deepEqual(err.toJSON(), { error: 'Resource not found.' })
})

test('InternalError wraps the causing error', () => {
  const cause = new Error('boom')
  const err = new SmError.InternalError(cause)
  assert.equal(err.message, 'boom')
  assert.deepEqual(err.detail, { error: cause })
})

test('PrivacyAckRequiredError message is the client-facing discriminator', () => {
  // client/src interceptor matches on this exact string
  assert.equal(new SmError.PrivacyAckRequiredError().message, 'privacy_ack_required')
})
