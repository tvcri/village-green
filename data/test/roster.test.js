import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { buildDataset } from '../generator/data.js'
import { buildLogins } from '../generator/guide.js'
import { wrapRoster, ROSTER_VERSION } from '../generator/roster-file.js'

const content = {}
for (const n of ['people', 'services', 'destinations']) {
  content[n] = JSON.parse(readFileSync(fileURLToPath(new URL(`../content/${n}.json`, import.meta.url)), 'utf8'))
}

test('roster file: carries version, fingerprint, and a non-empty logins array', () => {
  const ds = buildDataset(content, 20260630)
  const sizing = { villages: null, members: null, volunteers: null }
  const roster = wrapRoster(buildLogins(ds), { seed: 20260630, sizing })

  assert.equal(roster.rosterVersion, ROSTER_VERSION)
  assert.equal(roster.seed, 20260630)
  assert.deepEqual(roster.sizing, sizing)
  assert.ok(typeof roster.generatedAt === 'string' && roster.generatedAt.length > 0)
  assert.ok(Array.isArray(roster.logins) && roster.logins.length > 0)
})

// The playground mock-OIDC refuses to start unless every entry carries these
// six keys and at least one login is featured (an all-unfeatured roster renders
// an empty picker, which reads as a broken page rather than a data problem).
test('roster file: every entry has the six contract keys and at least one is featured', () => {
  const ds = buildDataset(content, 20260630)
  const { logins } = wrapRoster(buildLogins(ds), { seed: 20260630, sizing: {} })

  for (const [i, l] of logins.entries()) {
    for (const key of ['username', 'name', 'villages', 'role', 'demos', 'featured']) {
      assert.ok(key in l, `entry ${i} missing ${key}`)
    }
  }
  assert.ok(logins.some(l => l.featured === true))
})
