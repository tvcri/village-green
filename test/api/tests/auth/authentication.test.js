import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'
import { villages } from '../../setup/fixtures.js'

// Authentication + scope enforcement on a representative protected endpoint
// (the service-request list — addressed by operationId).

test('no Authorization header -> 401', async () => {
  const { status } = await vgCall('getServiceRequests')
  assert.equal(status, 401)
})

test('non-JWT bearer value -> 401', async () => {
  const { status } = await vgCall('getServiceRequests', {}, { token: tokens.special.notAJwt })
  assert.equal(status, 401)
})

test('tampered signature -> 401', async () => {
  const { status } = await vgCall('getServiceRequests', {}, { token: tokens.special.badSignature })
  assert.equal(status, 401)
})

test('expired token -> 401', async () => {
  const { status } = await vgCall('getServiceRequests', {}, { token: tokens.special.expired })
  assert.equal(status, 401)
})

test('token with a known-insecure kid -> 401', async () => {
  const { status } = await vgCall('getServiceRequests', {}, { token: tokens.special.insecureKid })
  assert.equal(status, 401)
})

test('wrong audience -> 401 (harness sets VG_JWT_AUD_VALUE)', async () => {
  const { status } = await vgCall('getServiceRequests', {}, { token: tokens.special.wrongAudience })
  assert.equal(status, 401)
})

test('missing audience claim -> 401 under audience enforcement', async () => {
  const { status } = await vgCall('getServiceRequests', {}, { token: tokens.special.missingAudience })
  assert.equal(status, 401)
})

// Scope-probe params: the special tokens carry full_v1's identity (village 1,
// role 2 — village-scoped read-only), and an unfiltered list is now a
// federation-wide query -> 403 by ROLE. Filtering to the granted village keeps
// these probes reachable, so only the claim/scope under test can fail.
const grantedVillage = { villageId: String(villages.quahog.id) }

test('foreign issuer claim is ACCEPTED (characterization: iss is never validated)', async () => {
  // The API trusts any token whose signature verifies against the discovered
  // JWKS (plus aud, when configured); jwt.verify is called with no `issuer`
  // option, so a token claiming another issuer still authenticates. Signature-
  // only trust is defensible with a single IdP — this pin makes a future
  // tightening (or loosening) deliberate rather than accidental.
  const { status } = await vgCall('getServiceRequests', grantedVillage, { token: tokens.special.foreignIssuer })
  assert.equal(status, 200)
})

test('valid token lacking the service-request scope -> 403 on GET', async () => {
  const { status, json } = await vgCall('getServiceRequests', grantedVillage, { token: tokens.special.noServiceRequestScope })
  assert.equal(status, 403)
  // The role would allow this read — the discriminator proves the scope gate fired.
  assert.equal(json.error, 'Required scopes were not found in token.')
})

test('read-only scope can GET but is forbidden from writing', async () => {
  const get = await vgCall('getServiceRequests', grantedVillage, { token: tokens.special.readOnly })
  assert.equal(get.status, 200)

  // The write half can't isolate scope by status alone anymore: the token's
  // identity (role 2) also lacks sr:write, so 403 would fire either way. But the
  // OAS security handler (validateOauthSecurity, bootstrap/middlewares.js
  // configureOpenApi) runs before the controller's permission check, so the
  // OutOfScopeError message proves the SCOPE gate is what denied the write.
  const post = await vgCall('createServiceRequest', {}, {
    token: tokens.special.readOnly,
    body: { villageId: String(villages.quahog.id) },
  })
  assert.equal(post.status, 403)
  assert.equal(post.json.error, 'Required scopes were not found in token.')
})
