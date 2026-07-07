import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgFetch } from '../../lib/client.js'

// Smoke: the harness booted a real server that reached the `available` state and
// serves its own OpenAPI definition. (The 503-until-ready gate is exercised by
// run.js's readiness probe.)

test('GET /op/state reports available', async () => {
  const { status, json } = await vgFetch('/op/state')
  assert.equal(status, 200)
  assert.equal(json.currentState, 'available')
})

test('GET /op/definition serves the OpenAPI document', async () => {
  const { status, json } = await vgFetch('/op/definition')
  assert.equal(status, 200)
  assert.ok(json && (json.openapi || json.paths), 'should look like an OpenAPI document')
})
