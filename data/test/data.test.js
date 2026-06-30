import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { makeRng } from '../generator/rng.js'
import { VILLAGES, ROLE } from '../generator/constants.js'
import { buildVillagesAndUsers } from '../generator/builders/villages.js'

const content = {
  people: JSON.parse(readFileSync(fileURLToPath(new URL('../content/people.json', import.meta.url)), 'utf8')),
}

test('villages: 10 villages with 1-based ids', () => {
  const { village, villageIdByName } = buildVillagesAndUsers(content, makeRng(1))
  assert.equal(village.length, 10)
  assert.equal(village[0].id, 1)
  assert.equal(villageIdByName[VILLAGES[0].name], 1)
})

test('users/grants: admin, multi-village coordinator, and zero-grants user exist', () => {
  const { user_data, village_grant } = buildVillagesAndUsers(content, makeRng(1))
  // every grant references a real user and a village in 1..10, role 1..4
  const userIds = new Set(user_data.map(u => u.userId))
  for (const g of village_grant) {
    assert.ok(userIds.has(g.userId))
    assert.ok(g.villageId >= 1 && g.villageId <= 10)
    assert.ok(g.roleId >= 1 && g.roleId <= 4)
  }
  // a coordinator with grants in >= 3 villages (meta roll-up)
  const byUser = {}
  for (const g of village_grant) (byUser[g.userId] ||= new Set()).add(g.villageId)
  assert.ok(Object.values(byUser).some(s => s.size >= 3), 'need a 3+ village coordinator')
  // at least one user with no grants at all
  assert.ok(user_data.some(u => !village_grant.some(g => g.userId === u.userId)), 'need a zero-grants user')
  // every role value appears somewhere
  const roles = new Set(village_grant.map(g => g.roleId))
  for (const r of Object.values(ROLE)) assert.ok(roles.has(r), `missing role ${r}`)
})
