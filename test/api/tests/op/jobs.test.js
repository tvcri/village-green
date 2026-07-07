import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgFetch } from '../../lib/client.js'
import { tokens } from '../../lib/context.js'

// Job scheduling is admin/elevate-gated (every Job op carries ElevateQuery).
const JOBS = '/jobs'

test('GET /jobs as a non-admin (no elevate) -> 403', async () => {
  const { status } = await vgFetch(JOBS, { token: tokens.users.full_v1 })
  assert.equal(status, 403)
})

test('GET /jobs as admin with elevate=true -> 200 lists jobs',
  { todo: 'the `job` table is not scaffolded in this schema, so getJobs 500s' }, async () => {
    const { status, json } = await vgFetch(JOBS, { token: tokens.users.admin, query: { elevate: 'true' } })
    assert.equal(status, 200)
    assert.ok(Array.isArray(json))
  })

test('GET /jobs with no token -> 401', async () => {
  const { status } = await vgFetch(JOBS)
  assert.equal(status, 401)
})
