import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgFetch } from '../lib/client.js'
import { tokens } from '../lib/context.js'
import { villages, persons } from '../setup/fixtures.js'

// ---- list endpoint: grant-filtered (GREEN) ----

test('full_v1 person list shows only Quahog people', async () => {
  const { status, json } = await vgFetch('/persons', { token: tokens.users.full_v1 })
  assert.equal(status, 200)
  const names = json.map(p => p.fullName)
  assert.ok(names.includes(persons.quahogMember.fullName), 'should include a Quahog person')
  assert.ok(!names.includes(persons.innsmouthMember.fullName), 'must not leak an Innsmouth person')
  assert.ok(!names.includes(persons.miskatonicMember.fullName), 'must not leak a Miskatonic person')
})

// ---- by-id within own grant: works (GREEN sanity) ----

test('full_v1 can read its own village person by id', async () => {
  const { status } = await vgFetch(`/persons/${persons.quahogMember.id}`, { token: tokens.users.full_v1 })
  assert.equal(status, 200)
})

// ---- by-id across villages: MUST be denied (RED — finding #1) ----

test('full_v1 cannot read an Innsmouth person by id', async () => {
  const { status, json } = await vgFetch(`/persons/${persons.innsmouthMember.id}`, { token: tokens.users.full_v1 })
  assert.equal(status, 404)
  if (json && json.address) {
    assert.fail(`leaked Innsmouth person contact info: ${JSON.stringify({ address: json.address, phone: json.phone, email: json.email })}`)
  }
})

// ---- nested route: guarded (GREEN) ----

test('full_v1 gets 404 for an ungranted village persons route', async () => {
  const { status } = await vgFetch(`/villages/${villages.innsmouth.id}/persons`, { token: tokens.users.full_v1 })
  assert.equal(status, 404)
})
