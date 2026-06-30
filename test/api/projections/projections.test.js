import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgFetch } from '../lib/client.js'
import { tokens } from '../lib/context.js'
import { villages, persons, serviceRequests as sr } from '../setup/fixtures.js'

// Projection coverage: each `?projection=` option expands the response with extra
// data. Exercised in an authorized (own-village / admin) context — the
// cross-village leak *via* projections is finding #1, asserted separately.

// ---- service-requests: memberAddress (finding #1) / volunteerAddress / notificationHistory ----

test('SR projection=volunteerAddress expands the volunteer address', async () => {
  const { status, json } = await vgFetch(`/service-requests/${sr.srV1.id}`, {
    token: tokens.users.full_v1, query: { projection: ['volunteerAddress'] },
  })
  assert.equal(status, 200)
  assert.ok('volunteerAddress' in json, 'volunteerAddress projected')
})

test('SR projection=notificationHistory expands the notification history', async () => {
  const { status, json } = await vgFetch(`/service-requests/${sr.srV1.id}`, {
    token: tokens.users.full_v1, query: { projection: ['notificationHistory'] },
  })
  assert.equal(status, 200)
  assert.ok('notificationHistory' in json, 'notificationHistory projected')
})

// ---- persons: memberInfo / volunteerInfo ----

test('person projection=memberInfo expands member details', async () => {
  const { status, json } = await vgFetch(`/persons/${persons.quahogMember.id}`, {
    token: tokens.users.full_v1, query: { projection: ['memberInfo'] },
  })
  assert.equal(status, 200)
  assert.ok('memberInfo' in json, 'memberInfo projected')
})

test('person projection=volunteerInfo expands volunteer details', async () => {
  const { status, json } = await vgFetch(`/persons/${persons.quahogVolunteer.id}`, {
    token: tokens.users.full_v1, query: { projection: ['volunteerInfo'] },
  })
  assert.equal(status, 200)
  assert.ok('volunteerInfo' in json, 'volunteerInfo projected')
})

// ---- villages: owners / personCounts / statistics ----

test('village projections expand the village (owners, personCounts)', async () => {
  for (const p of ['owners', 'personCounts']) {
    const { status, json } = await vgFetch(`/villages/${villages.quahog.id}`, {
      token: tokens.users.full_v1, query: { projection: [p] },
    })
    assert.equal(status, 200, `village projection ${p} status`)
    assert.ok(p in json, `${p} projected`)
  }
})

test('village projection=statistics expands village statistics',
  { todo: 'the village `statistics` projection 500s on a SQL syntax error' }, async () => {
    const { status, json } = await vgFetch(`/villages/${villages.quahog.id}`, {
      token: tokens.users.full_v1, query: { projection: ['statistics'] },
    })
    assert.equal(status, 200)
    assert.ok('statistics' in json, 'statistics projected')
  })

// ---- users: villageGrants (admin+elevate) / self webPreferences ----

test('users projection=villageGrants expands each user (admin+elevate)', async () => {
  const { status, json } = await vgFetch('/users', {
    token: tokens.users.admin, query: { elevate: 'true', projection: ['villageGrants'] },
  })
  assert.equal(status, 200)
  assert.ok(Array.isArray(json) && json.length > 0)
  assert.ok('villageGrants' in json[0], 'villageGrants projected per user')
})

test('GET /user projection=webPreferences expands web preferences', async () => {
  const { status, json } = await vgFetch('/user', {
    token: tokens.users.full_v1, query: { projection: ['webPreferences'] },
  })
  assert.equal(status, 200)
  assert.ok('webPreferences' in json, 'webPreferences projected')
})
