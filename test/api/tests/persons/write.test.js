import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgFetch } from '../../lib/client.js'
import { tokens } from '../../lib/context.js'
import { villages, persons } from '../../setup/fixtures.js'

// Person create/patch/delete. createPerson in your own village works (GREEN).
// The Person controller applies NO village-grant check on the write paths
// (createPerson trusts body.villageId; patch/delete look the row up with a
// grant-blind getPerson), so cross-village writes slip through — finding #5.
// Each cross-village probe asserts the SECURE outcome and undoes any successful
// insecure write so the rest of the run is unaffected.
const PERSONS = '/persons'
const quahog = String(villages.quahog.id)
const innsmouth = String(villages.innsmouth.id)

// ---- createPerson happy path (GREEN) ----

test('createPerson in the caller\'s own village returns 201 and echoes fields', async () => {
  const { status, json } = await vgFetch(PERSONS, {
    token: tokens.users.full_v1,
    body: { villageId: quahog, firstName: 'Glenn', lastName: 'Quagmire' },
  })
  assert.equal(status, 201)
  assert.equal(json.fullName, 'Quagmire, Glenn') // fullName is DB-generated as "last, first"
  if (json.personId) await vgFetch(`${PERSONS}/${json.personId}`, { token: tokens.users.full_v1, method: 'DELETE' })
})

// ---- cross-village writes: MUST be denied (RED — finding #5) ----

test('createPerson into an ungranted village is denied', async () => {
  const res = await vgFetch(PERSONS, {
    token: tokens.users.full_v1, // Quahog only
    body: { villageId: innsmouth, firstName: 'Intruder', lastName: 'Person' },
  })
  if (res.status === 201 && res.json?.personId) {
    await vgFetch(`${PERSONS}/${res.json.personId}`, { token: tokens.users.admin, method: 'DELETE' })
  }
  assert.ok(res.status === 403 || res.status === 404, `expected denial, got ${res.status}`)
})

test('patchPerson on a person in an ungranted village is denied', async () => {
  // No-op same-value patch: even a successful insecure write changes nothing.
  const { status } = await vgFetch(`${PERSONS}/${persons.innsmouthMember.id}`, {
    token: tokens.users.full_v1, method: 'PATCH',
    body: { lastName: persons.innsmouthMember.lastName },
  })
  assert.ok(status === 403 || status === 404, `expected denial, got ${status}`)
})

test('deletePerson on a person in an ungranted village is denied', async () => {
  // Probe a throwaway Innsmouth person so a successful insecure delete is harmless.
  const created = await vgFetch(PERSONS, {
    token: tokens.users.admin, body: { villageId: innsmouth, firstName: 'Throwaway', lastName: 'Innsmouth' },
  })
  assert.equal(created.status, 201)
  const id = created.json.personId
  const del = await vgFetch(`${PERSONS}/${id}`, { token: tokens.users.full_v1, method: 'DELETE' })
  if (del.status !== 200) await vgFetch(`${PERSONS}/${id}`, { token: tokens.users.admin, method: 'DELETE' })
  assert.ok(del.status === 403 || del.status === 404, `expected denial, got ${del.status}`)
})
