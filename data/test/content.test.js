import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const load = (name) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`../content/${name}`, import.meta.url)), 'utf8'))

// The 13 capability names every serviceName.capability must match.
const CAPS = new Set(['Circles', 'Errands', 'Friends', 'Governance', 'Healthcare Support',
  'Home Help', 'New Member Intake', 'Office Services', 'Rides', 'Safety Net',
  'Service Referrals', 'Tech Support', 'Village Affiliation'])

test('services.json has the expected shape and valid capabilities', () => {
  const s = load('services.json')
  assert.ok(Array.isArray(s.serviceNames) && s.serviceNames.length >= 40)
  for (const sn of s.serviceNames) {
    assert.equal(typeof sn.serviceName, 'string')
    assert.ok(CAPS.has(sn.capability), `bad capability: ${sn.capability}`)
  }
  assert.ok(Array.isArray(s.transportationTypes) && s.transportationTypes.length >= 4)
  assert.ok(Array.isArray(s.memberDropReasons) && s.memberDropReasons.length >= 5)
  assert.ok(Array.isArray(s.vettingTypes) && s.vettingTypes.length >= 3)
  assert.ok(Array.isArray(s.disabilities) && s.disabilities.length >= 5)
  assert.ok(s.fcvActivities && Array.isArray(s.fcvActivities.contactTypes))
  assert.ok(Array.isArray(s.fcvActivities.activityTypes))
})

test('destinations.json has destinations and the Miskatonic Health network', () => {
  const d = load('destinations.json')
  assert.ok(Array.isArray(d.destinations) && d.destinations.length >= 40)
  for (const dest of d.destinations) {
    assert.equal(typeof dest.name, 'string')
    assert.equal(typeof dest.category, 'string')
  }
  assert.ok(Array.isArray(d.miskatonicHealth) && d.miskatonicHealth.length >= 15)
})
