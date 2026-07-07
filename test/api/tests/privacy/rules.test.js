import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgFetch } from '../../lib/client.js'
import { tokens } from '../../lib/context.js'
import { users } from '../../setup/fixtures.js'

// Privacy rules lifecycle + the API-side acknowledgement gate (PR #31).
//
// ORDER MATTERS — suite-wide side effects. Publishing rules arms a fail-closed
// gate in the auth layer: every endpoint except GET /user, GET /privacy/rules,
// and POST /privacy/acknowledgements returns 403 `privacy_ack_required` for any
// user who hasn't acknowledged the CURRENT version. seed.js truncates the
// privacy tables, so no rules exist until this file publishes some — and the
// FINAL test acknowledges on behalf of every canonical user so the files that
// run after this one (service-request/, users/, villages/, ...) are unaffected.
// The special tokens share full_v1's identity, so acking full_v1 covers them.
const RULES = '/privacy/rules'
const ACKS = '/privacy/acknowledgements'

async function currentRulesId () {
  const { status, json } = await vgFetch(RULES, { token: tokens.users.admin })
  assert.equal(status, 200, 'precondition: rules published')
  return json.id
}

// ---- before anything is published ----

test('GET /privacy/rules with no token -> 401', async () => {
  const { status } = await vgFetch(RULES)
  assert.equal(status, 401)
})

test('GET /privacy/rules before any publish -> 404', async () => {
  const { status } = await vgFetch(RULES, { token: tokens.users.full_v1 })
  assert.equal(status, 404)
})

test('PATCH /privacy/rules/current before any publish -> 404', async () => {
  const { status } = await vgFetch(`${RULES}/current`, {
    token: tokens.users.admin, method: 'PATCH', body: { content: 'nothing to correct' },
  })
  assert.equal(status, 404)
})

test('publish and correct are admin-only -> 403 for a non-admin', async () => {
  const post = await vgFetch(RULES, {
    token: tokens.users.full_v1, body: { content: 'not allowed' },
  })
  assert.equal(post.status, 403)
  const patch = await vgFetch(`${RULES}/current`, {
    token: tokens.users.full_v1, method: 'PATCH', body: { content: 'not allowed' },
  })
  assert.equal(patch.status, 403)
})

// ---- publish v1 (arms the gate for everyone but the publisher) ----

test('publishPrivacyRules creates v1 and auto-acknowledges the publisher', async () => {
  const { status, json } = await vgFetch(RULES, {
    token: tokens.users.admin, body: { content: 'VG Privacy Rules v1' },
  })
  assert.equal(status, 201)
  assert.ok(json.id, 'rules have an id')
  assert.equal(json.content, 'VG Privacy Rules v1')
  assert.equal(String(json.publishedByUserId), String(users.admin.userId))
  assert.equal(json.modifiedAt, null, 'fresh version has no correction')

  // publisher auto-ack: the admin is not locked out of the API it just gated
  const probe = await vgFetch('/service-requests', { token: tokens.users.admin })
  assert.equal(probe.status, 200)
})

test('unacknowledged users are blocked outside the allowlist', async () => {
  const blocked = await vgFetch('/service-requests', { token: tokens.users.full_v1 })
  assert.equal(blocked.status, 403)
  assert.equal(blocked.json?.error, 'privacy_ack_required',
    `expected the privacy_ack_required discriminator, got ${blocked.text}`)
})

test('the allowlist stays reachable while blocked: GET /user, GET rules, POST ack', async () => {
  const self = await vgFetch('/user', { token: tokens.users.full_v1 })
  assert.equal(self.status, 200)
  assert.ok('privacyStatus' in self.json, 'GET /user always projects privacyStatus')

  const rules = await vgFetch(RULES, { token: tokens.users.full_v1 })
  assert.equal(rules.status, 200, 'the modal can fetch the agreement text')
})

test('acknowledging the current rules clears the block', async () => {
  const rulesId = await currentRulesId()
  const ack = await vgFetch(ACKS, { token: tokens.users.full_v1, body: { rulesId } })
  assert.equal(ack.status, 201)
  assert.equal(ack.json.rulesId, rulesId)
  assert.ok(ack.json.acknowledgedAt, 'acknowledgement is timestamped')

  const probe = await vgFetch('/service-requests', { token: tokens.users.full_v1 })
  assert.equal(probe.status, 200, 'full_v1 unblocked after acking')
})

// ---- correction vs. new version ----

test('PATCH /privacy/rules/current corrects in place without re-blocking', async () => {
  const before = await currentRulesId()
  const { status, json } = await vgFetch(`${RULES}/current`, {
    token: tokens.users.admin, method: 'PATCH', body: { content: 'VG Privacy Rules v1 (corrected)' },
  })
  assert.equal(status, 200)
  assert.equal(json.id, before, 'correction keeps the same version id')
  assert.equal(json.content, 'VG Privacy Rules v1 (corrected)')
  assert.equal(String(json.modifiedByUserId), String(users.admin.userId))
  assert.ok(json.modifiedAt, 'correction is timestamped')

  const probe = await vgFetch('/service-requests', { token: tokens.users.full_v1 })
  assert.equal(probe.status, 200, 'existing acknowledgements stay valid after a correction')
})

test('publishing a new version re-blocks; acking a STALE version does not clear it', async () => {
  const v1 = await currentRulesId()
  const v2 = await vgFetch(RULES, {
    token: tokens.users.admin, body: { content: 'VG Privacy Rules v2' },
  })
  assert.equal(v2.status, 201)
  assert.ok(v2.json.id > v1, 'new publish gets a new id')

  const blocked = await vgFetch('/service-requests', { token: tokens.users.full_v1 })
  assert.equal(blocked.status, 403, 'v1 ack does not cover v2')

  // re-acking the outdated version must not clear the gate
  await vgFetch(ACKS, { token: tokens.users.full_v1, body: { rulesId: v1 } })
  const stillBlocked = await vgFetch('/service-requests', { token: tokens.users.full_v1 })
  assert.equal(stillBlocked.status, 403, 'stale-version ack leaves the gate armed')

  const ack = await vgFetch(ACKS, { token: tokens.users.full_v1, body: { rulesId: v2.json.id } })
  assert.equal(ack.status, 201)
  const probe = await vgFetch('/service-requests', { token: tokens.users.full_v1 })
  assert.equal(probe.status, 200, 'current-version ack clears it')
})

// ---- suite-state restore: every canonical user acks the current version ----
// This runs even if earlier assertions failed (node:test continues past
// failures), so the post-privacy test files always start unblocked.

test('all canonical users acknowledge the current rules', async () => {
  const rulesId = await currentRulesId()
  // Ack every user first, assert afterward: asserting inside the loop would
  // stop at the first failure and leave the remaining users blocked, turning
  // one bad ack into privacy_ack_required failures across every later file.
  const results = []
  for (const [role, token] of Object.entries(tokens.users)) {
    const { status } = await vgFetch(ACKS, { token, body: { rulesId } })
    results.push({ role, status })
  }
  for (const { role, status } of results) {
    assert.equal(status, 201, `${role} acknowledged`)
  }
  const probe = await vgFetch('/service-requests', { token: tokens.users.scratch })
  assert.equal(probe.status, 200, 'spot check: scratch user unblocked')
})
