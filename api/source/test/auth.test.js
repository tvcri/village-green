'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const jwt = require('jsonwebtoken')
const config = require('../utils/config')
const SmError = require('../utils/error')
const auth = require('../utils/auth')

// ---------------------------------------------------------------------------
// getClaimByPath
// ---------------------------------------------------------------------------

test('getClaimByPath traverses a dot path', () => {
  assert.deepEqual(auth.getClaimByPath({ a: { b: ['x', 'y'] } }, 'a.b'), ['x', 'y'])
})

test('getClaimByPath defaults to the configured privileges path (realm_access.roles)', () => {
  assert.deepEqual(auth.getClaimByPath({ realm_access: { roles: ['admin'] } }), ['admin'])
})

test('getClaimByPath returns [] for a missing segment', () => {
  assert.deepEqual(auth.getClaimByPath({ a: {} }, 'a.b.c'), [])
})

test('getClaimByPath returns [] for null object or empty path', () => {
  assert.deepEqual(auth.getClaimByPath(null, 'a.b'), [])
  assert.deepEqual(auth.getClaimByPath({ a: 1 }, ''), [])
})

test('getClaimByPath returns [] when the resolved value is falsy', () => {
  assert.deepEqual(auth.getClaimByPath({ a: { b: 0 } }, 'a.b'), [])
})

// ---------------------------------------------------------------------------
// decodeToken / verifyToken
// ---------------------------------------------------------------------------

const SECRET = 'unit-test-secret'

test('decodeToken returns the complete decoded token for a valid JWT', () => {
  const t = jwt.sign({ sub: 'lovecraft' }, SECRET)
  const obj = auth.decodeToken(t)
  assert.equal(obj.payload.sub, 'lovecraft')
  assert.equal(obj.header.alg, 'HS256')
})

test('decodeToken throws AuthorizeError for a non-JWT bearer string', () => {
  assert.throws(() => auth.decodeToken('not-a-jwt'), SmError.AuthorizeError)
})

test('verifyToken accepts a token signed with the given key', () => {
  const t = jwt.sign({ sub: 'x' }, SECRET)
  auth.verifyToken(t, SECRET) // must not throw
})

test('verifyToken rejects a bad signature as AuthorizeError', () => {
  const t = jwt.sign({ sub: 'x' }, 'other-key')
  assert.throws(() => auth.verifyToken(t, SECRET), err => {
    assert.ok(err instanceof SmError.AuthorizeError)
    assert.equal(err.detail, 'invalid signature')
    return true
  })
})

test('verifyToken rejects an expired token as AuthorizeError', () => {
  const t = jwt.sign({ sub: 'x' }, SECRET, { expiresIn: -10 })
  assert.throws(() => auth.verifyToken(t, SECRET), err => {
    assert.ok(err instanceof SmError.AuthorizeError)
    assert.equal(err.detail, 'jwt expired')
    return true
  })
})

test('verifyToken enforces audience only when config.oauth.audienceValue is set', () => {
  const saved = config.oauth.audienceValue
  try {
    config.oauth.audienceValue = 'vg-api'
    auth.verifyToken(jwt.sign({ aud: 'vg-api' }, SECRET), SECRET) // must not throw
    assert.throws(
      () => auth.verifyToken(jwt.sign({ aud: 'someone-else' }, SECRET), SECRET),
      err => {
        assert.ok(err instanceof SmError.AuthorizeError)
        assert.match(err.detail, /audience/)
        return true
      }
    )
    config.oauth.audienceValue = undefined
    auth.verifyToken(jwt.sign({ aud: 'someone-else' }, SECRET), SECRET) // aud ignored
  } finally {
    config.oauth.audienceValue = saved
  }
})

// ---------------------------------------------------------------------------
// checkInsecureKid
// ---------------------------------------------------------------------------

const INSECURE_KID = config.oauth.insecureKids[0]

test('checkInsecureKid throws InsecureTokenError for a known insecure kid', () => {
  assert.throws(
    () => auth.checkInsecureKid({ header: { kid: INSECURE_KID } }),
    SmError.InsecureTokenError
  )
})

test('checkInsecureKid passes an unlisted kid', () => {
  auth.checkInsecureKid({ header: { kid: 'some-normal-kid' } }) // must not throw
})

test('checkInsecureKid allows insecure kids when allowInsecureTokens is on', () => {
  const saved = config.oauth.allowInsecureTokens
  try {
    config.oauth.allowInsecureTokens = true
    auth.checkInsecureKid({ header: { kid: INSECURE_KID } }) // must not throw
  } finally {
    config.oauth.allowInsecureTokens = saved
  }
})

// ---------------------------------------------------------------------------
// validateOauthSecurity — the OAS security handler's scope matching
// ---------------------------------------------------------------------------

const scopeReq = scope => ({ access_token: { [config.oauth.claims.scope]: scope } })

test('validateOauthSecurity throws NoTokenError without an access token', () => {
  assert.throws(() => auth.validateOauthSecurity({}, ['vg']), SmError.NoTokenError)
})

test('validateOauthSecurity accepts an exact scope from a space-delimited string claim', () => {
  assert.equal(auth.validateOauthSecurity(scopeReq('openid vg'), ['vg']), true)
})

test('validateOauthSecurity accepts an exact scope from an array claim', () => {
  assert.equal(auth.validateOauthSecurity(scopeReq(['vg']), ['vg']), true)
})

test('a broader granted scope satisfies a narrower requirement (vg grants vg:op)', () => {
  assert.equal(auth.validateOauthSecurity(scopeReq('vg'), ['vg:op']), true)
})

test('a narrower granted scope does NOT satisfy a broader requirement (vg:op does not grant vg)', () => {
  assert.throws(() => auth.validateOauthSecurity(scopeReq('vg:op'), ['vg']), SmError.OutOfScopeError)
})

test('scope matching is segment-wise, not string-prefix (ab does not grant abc:x)', () => {
  assert.throws(() => auth.validateOauthSecurity(scopeReq('ab'), ['abc:x']), SmError.OutOfScopeError)
})

test('disjoint scopes throw OutOfScopeError', () => {
  assert.throws(() => auth.validateOauthSecurity(scopeReq('openid email'), ['vg']), SmError.OutOfScopeError)
})

// ---------------------------------------------------------------------------
// requirePrivacyAck — fail-closed gate + its allowlist
// ---------------------------------------------------------------------------

// Runs the middleware with a stub next(); resolves to the error it forwarded
// (undefined = allowed through).
async function runPrivacyGate({ method, path, userObject }) {
  let forwarded
  await auth.requirePrivacyAck({ method, path, userObject }, {}, err => { forwarded = err })
  return forwarded
}

const owingUser = { userId: '42', privacyAckRequired: true }

test('requirePrivacyAck lets unauthenticated requests through to the auth layers', async () => {
  assert.equal(await runPrivacyGate({ method: 'GET', path: '/villages', userObject: undefined }), undefined)
})

test('requirePrivacyAck passes a user with no acknowledgement owed', async () => {
  const userObject = { userId: '42', privacyAckRequired: false }
  assert.equal(await runPrivacyGate({ method: 'GET', path: '/villages', userObject }), undefined)
})

test('requirePrivacyAck blocks a non-allowlisted request when an ack is owed', async () => {
  const err = await runPrivacyGate({ method: 'GET', path: '/villages', userObject: owingUser })
  assert.ok(err instanceof SmError.PrivacyAckRequiredError)
})

test('every allowlist entry passes while an ack is owed', async () => {
  for (const [method, path] of [
    ['GET', '/op/definition'],
    ['GET', '/privacy/rules'],
    ['POST', '/privacy/acknowledgements'],
    ['GET', '/user'],
  ]) {
    assert.equal(await runPrivacyGate({ method, path, userObject: owingUser }), undefined, `${method} ${path}`)
  }
})

test('allowlist matching is exact: wrong method or extended path stays blocked', async () => {
  for (const [method, path] of [
    ['POST', '/privacy/rules'],       // allowlisted path, wrong method
    ['GET', '/privacy/rules/1'],      // path extension is not a prefix match
    ['GET', '/users'],                // /user must not match /users
  ]) {
    const err = await runPrivacyGate({ method, path, userObject: owingUser })
    assert.ok(err instanceof SmError.PrivacyAckRequiredError, `${method} ${path}`)
  }
})

// ---------------------------------------------------------------------------
// validateWebhookBearer
// ---------------------------------------------------------------------------

const bearerReq = header => ({ headers: header ? { authorization: header } : {} })

test('validateWebhookBearer accepts the configured key (scheme case-insensitive)', () => {
  const saved = config.webhook.key
  try {
    config.webhook.key = 'hook-key'
    assert.equal(auth.validateWebhookBearer(bearerReq('Bearer hook-key')), true)
    assert.equal(auth.validateWebhookBearer(bearerReq('bearer hook-key')), true)
  } finally {
    config.webhook.key = saved
  }
})

test('validateWebhookBearer rejects wrong key, missing header, and unconfigured key', () => {
  const saved = config.webhook.key
  try {
    config.webhook.key = 'hook-key'
    assert.throws(() => auth.validateWebhookBearer(bearerReq('Bearer wrong')), SmError.UnauthorizedError)
    assert.throws(() => auth.validateWebhookBearer(bearerReq()), SmError.UnauthorizedError)
    // fail-closed when no key is configured, even if the request omits one too
    config.webhook.key = undefined
    assert.throws(() => auth.validateWebhookBearer(bearerReq('Bearer anything')), SmError.UnauthorizedError)
  } finally {
    config.webhook.key = saved
  }
})
