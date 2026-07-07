import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgFetch } from '../../lib/client.js'
import { tokens } from '../../lib/context.js'
import { villages } from '../../setup/fixtures.js'

// Each `?projection=` option expands the village with extra data. Exercised in
// an authorized (own-village) context; read grant-gating is in read.test.js.

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
