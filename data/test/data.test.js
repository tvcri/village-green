import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { makeRng } from '../generator/rng.js'
import { VILLAGES, ROLE } from '../generator/constants.js'
import { buildVillagesAndUsers } from '../generator/builders/villages.js'
import { buildPersons } from '../generator/builders/persons.js'
import { buildMembership } from '../generator/builders/membership.js'

const content = {
  people: JSON.parse(readFileSync(fileURLToPath(new URL('../content/people.json', import.meta.url)), 'utf8')),
}

const services = JSON.parse(readFileSync(fileURLToPath(new URL('../content/services.json', import.meta.url)), 'utf8'))
const fullContent = { people: content.people, services }

test('villages: 10 villages with 1-based ids', () => {
  const { village, villageIdByName } = buildVillagesAndUsers(content, makeRng(1))
  assert.equal(village.length, 10)
  assert.equal(village[0].id, 1)
  assert.equal(villageIdByName[VILLAGES[0].name], 1)
})

test('persons: no address key, unique (village,name), themed big villages', () => {
  const { village, villageIdByName } = buildVillagesAndUsers(fullContent, makeRng(1))
  const { person, byVillage } = buildPersons(fullContent, villageIdByName, makeRng(1))
  for (const p of person) {
    assert.ok(!('address' in p), 'person rows must not set the generated address column')
    assert.equal(typeof p.full_name, 'string')
    assert.ok(p.village_id >= 1 && p.village_id <= 10)
  }
  // unique (village_id, full_name)
  const keys = person.map(p => `${p.village_id}::${p.full_name.toLowerCase()}`)
  assert.equal(keys.length, new Set(keys).size)
  // big villages (Arkham=1, Quahog=2) each have >=50 members and >=50 volunteers
  for (const vid of [villageIdByName['Arkham'], villageIdByName['Quahog']]) {
    assert.ok(byVillage[vid].members.length >= 50, `members in ${vid}`)
    assert.ok(byVillage[vid].volunteers.length >= 50, `volunteers in ${vid}`)
  }
})

test('membership: status/active invariants and <=10% member/volunteer overlap', () => {
  const { villageIdByName } = buildVillagesAndUsers(fullContent, makeRng(1))
  const { person, byVillage } = buildPersons(fullContent, villageIdByName, makeRng(1))
  const m = buildMembership({ person, byVillage }, fullContent, makeRng(1))
  const personIds = new Set(person.map(p => p.id))

  for (const row of m.member) {
    assert.ok(personIds.has(row.person_id))
    assert.equal(typeof row.status, 'string')
    if (row.status !== 'Active') assert.ok(row.drop_reason, 'inactive members need a drop_reason')
  }
  assert.ok(m.member.some(r => r.status === 'Active'))
  assert.ok(m.member.some(r => r.status !== 'Active'))

  for (const row of m.volunteer) {
    assert.ok(personIds.has(row.person_id))
    assert.ok(row.active === 0 || row.active === 1)
  }
  assert.ok(m.volunteer.some(r => r.active === 1) && m.volunteer.some(r => r.active === 0))

  // overlap: persons who are BOTH member and volunteer <= 10% of volunteers
  const memberPersons = new Set(m.member.map(r => r.person_id))
  const both = m.volunteer.filter(r => memberPersons.has(r.person_id)).length
  assert.ok(both <= Math.ceil(m.volunteer.length * 0.10), `overlap ${both}/${m.volunteer.length}`)

  // junctions reference valid parents
  const volIds = new Set(m.volunteer.map(v => v.id))
  for (const vc of m.volunteer_capability) assert.ok(volIds.has(vc.volunteer_id))
  for (const vv of m.volunteer_vetting) assert.ok(volIds.has(vv.volunteer_id))
  const disIds = new Set(m.disability.map(d => d.id))
  for (const pd of m.person_disability) assert.ok(disIds.has(pd.disability_id) && personIds.has(pd.person_id))
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
