import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgFetch } from '../../lib/client.js'
import { tokens } from '../../lib/context.js'
import { serviceRequests as sr } from '../../setup/fixtures.js'

// Each `?projection=` option expands the response with extra data. Exercised in
// an authorized (own-village) context — the cross-village leak *via* projections
// is finding #1, asserted in authz.test.js.

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
