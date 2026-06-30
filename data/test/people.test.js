import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const people = JSON.parse(
  readFileSync(fileURLToPath(new URL('../content/people.json', import.meta.url)), 'utf8'),
)

test('people.json is a large, de-duped, tagged roster', () => {
  assert.ok(Array.isArray(people.figures), 'figures is an array')
  assert.ok(people.figures.length >= 240, `figures=${people.figures.length} (want >= 240)`)

  // globally unique names (the schema enforces unique (village_id, full_name);
  // we keep names globally unique so a figure never appears in two villages)
  const names = people.figures.map(f => f.name.toLowerCase())
  assert.equal(names.length, new Set(names).size, 'figure names must be globally unique')
})

test('every figure is tagged; gag cameos carry a gag object', () => {
  const gags = people.figures.filter(f => f.tag === 'gag')
  assert.ok(gags.length >= 90, `gag cameos=${gags.length} (want >= 90)`)
  for (const f of people.figures) {
    assert.ok(f.tag === 'gag' || f.tag === 'background', `bad tag on ${f.name}: ${f.tag}`)
    assert.equal(typeof f.name, 'string')
    assert.equal(typeof f.bucket, 'string')
  }
  for (const g of gags) {
    assert.ok(g.gag && typeof g.gag.serviceName === 'string', `gag missing serviceName: ${g.name}`)
    assert.ok(typeof g.gag.destination === 'string', `gag missing destination: ${g.name}`)
  }
})

test('login personas are present for the README', () => {
  assert.ok(Array.isArray(people.loginPersonas) && people.loginPersonas.length >= 12,
    `loginPersonas=${people.loginPersonas?.length}`)
})
