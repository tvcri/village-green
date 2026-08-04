import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { buildDataset } from '../generator/data.js'
import { buildGuide, buildLogins } from '../generator/guide.js'

const content = {}
for (const n of ['people', 'services', 'destinations']) {
  content[n] = JSON.parse(readFileSync(fileURLToPath(new URL(`../content/${n}.json`, import.meta.url)), 'utf8'))
}

test('guide: markdown names the planted scenarios', () => {
  const ds = buildDataset(content, 20260630)
  const md = buildGuide(ds)
  const p = ds.__meta.plants
  assert.ok(md.includes(p.duplicateEmail.email))
  assert.ok(md.includes(p.ackModalUsername))
  assert.ok(md.includes('Pride') && md.includes('Veteran'))
  assert.ok(md.includes(p.standingSeries.member.name))
})

test('logins roster: every user_data row present with role + blurb; featured personas flagged', () => {
  const ds = buildDataset(content, 20260630)
  const logins = buildLogins(ds)
  assert.equal(logins.length, ds.user_data.length + 1)
  for (const l of logins) {
    assert.ok(l.username && l.name !== undefined && typeof l.demos === 'string' && l.demos.length > 0)
    assert.ok(Array.isArray(l.villages))
  }
  const admin = logins.find(l => l.username === 'admin')
  assert.equal(admin.featured, true)
  assert.equal(logins.find(l => l.username === 'mr.calimari@quahog.test').featured, true)
})
