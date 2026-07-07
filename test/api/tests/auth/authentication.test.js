import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgFetch } from '../../lib/client.js'
import { tokens } from '../../lib/context.js'
import { villages } from '../../setup/fixtures.js'

// Authentication + scope enforcement on a representative protected endpoint.
const SR = '/service-requests'

test('no Authorization header -> 401', async () => {
  const { status } = await vgFetch(SR)
  assert.equal(status, 401)
})

test('non-JWT bearer value -> 401', async () => {
  const { status } = await vgFetch(SR, { token: tokens.special.notAJwt })
  assert.equal(status, 401)
})

test('tampered signature -> 401', async () => {
  const { status } = await vgFetch(SR, { token: tokens.special.badSignature })
  assert.equal(status, 401)
})

test('expired token -> 401', async () => {
  const { status } = await vgFetch(SR, { token: tokens.special.expired })
  assert.equal(status, 401)
})

test('token with a known-insecure kid -> 401', async () => {
  const { status } = await vgFetch(SR, { token: tokens.special.insecureKid })
  assert.equal(status, 401)
})

test('valid token lacking the service-request scope -> 403 on GET', async () => {
  const { status } = await vgFetch(SR, { token: tokens.special.noServiceRequestScope })
  assert.equal(status, 403)
})

test('read-only scope can GET but is forbidden from writing', async () => {
  const get = await vgFetch(SR, { token: tokens.special.readOnly })
  assert.equal(get.status, 200)

  // Body is schema-valid (only villageId required; status is server-derived) so
  // the only thing that can fail is the write-scope check.
  const post = await vgFetch(SR, {
    token: tokens.special.readOnly,
    body: { villageId: String(villages.quahog.id) },
  })
  assert.equal(post.status, 403)
})
