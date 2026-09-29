import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'
import { villages } from '../../setup/fixtures.js'

// The ungated person-record additions from the 2026-09-02 working group:
// firstName optional (mononyms), suffix + generated displayName, deceasedDate,
// preferredContactMethod (lookup), languages (junction, one preferred),
// contacts (child table, one primary). The flat emergencyContact* columns are
// untouched in this PR and must keep working. All created rows are deleted.
const staff = tokens.users.staff
const scratch = String(villages.scratch.id)
const created = []
after(async () => {
  for (const id of created) await vgCall('deletePerson', { personId: id }, { token: staff })
})
async function create (body) {
  const res = await vgCall('createPerson', {}, { token: staff, body: { villageId: scratch, ...body } })
  assert.equal(res.status, 201, JSON.stringify(res.json))
  created.push(res.json.personId)
  return res.json
}

test('a person may have no first name; fullName and displayName degrade cleanly', async () => {
  const p = await create({ lastName: 'Cher' })
  assert.equal(p.firstName, null)
  assert.equal(p.fullName, 'Cher')
  assert.equal(p.displayName, 'Cher')
  const blank = await vgCall('createPerson', {}, { token: staff, body: { villageId: scratch, lastName: 'X', firstName: '' } })
  assert.equal(blank.status, 400, 'empty-string firstName is rejected (NULL, never "")')
})

test('suffix lands in displayName and trails the inverted fullName, never in lastName', async () => {
  const p = await create({ firstName: 'John', lastName: 'Astor', suffix: 'III' })
  assert.equal(p.lastName, 'Astor')
  assert.equal(p.displayName, 'John Astor III')
  assert.equal(p.fullName, 'Astor, John, III', 'inverted form keeps the suffix after the first name (Chicago/MLA)')
  const patched = await vgCall('patchPerson', { personId: p.personId }, { token: staff, body: { suffix: null } })
  assert.equal(patched.json.displayName, 'John Astor')
  assert.equal(patched.json.fullName, 'Astor, John')
})

test('deceasedDate and preferredContactMethod round-trip', async () => {
  const cms = (await vgCall('getContactMethods', {}, { token: staff })).json
  const cell = cms.find(c => c.name === 'Cell').contactMethodId
  const p = await create({ firstName: 'Dee', lastName: 'Ceased', deceasedDate: '2026-01-31', preferredContactMethodId: cell })
  assert.equal(p.deceasedDate, '2026-01-31')
  assert.deepEqual(p.preferredContactMethod, { contactMethodId: cell, name: 'Cell' })
  const cleared = await vgCall('patchPerson', { personId: p.personId }, { token: staff, body: { deceasedDate: null, preferredContactMethodId: null } })
  assert.equal(cleared.json.deceasedDate, null)
  assert.equal(cleared.json.preferredContactMethod, null)
})

test('languages: several per person, preferred first, at most one preferred', async () => {
  const langs = (await vgCall('getLanguages', {}, { token: staff })).json
  const id = name => langs.find(l => l.name === name).languageId
  const p = await create({ firstName: 'Poly', lastName: 'Glot',
    languages: [{ languageId: id('English') }, { languageId: id('Portuguese'), isPreferred: true }] })
  assert.deepEqual(p.languages.map(l => [l.name, l.tag, l.isPreferred]), [['Portuguese', 'pt', true], ['English', 'en', false]])
  const two = await vgCall('patchPerson', { personId: p.personId }, { token: staff,
    body: { languages: [{ languageId: id('English'), isPreferred: true }, { languageId: id('Spanish'), isPreferred: true }] } })
  assert.equal(two.status, 400, 'two preferred languages are rejected')
  const one = await vgCall('patchPerson', { personId: p.personId }, { token: staff, body: { languages: [] } })
  assert.deepEqual(one.json.languages, [])
  const board = await vgCall('getPerson', { personId: p.personId }, { token: tokens.users.board })
  assert.ok(Array.isArray(board.json.languages), 'languages are ungated (T2)')
})

test('contacts: typed, ordered primary-first, at most one primary; flat columns untouched', async () => {
  const p = await create({ firstName: 'Con', lastName: 'Tact', emergencyContactName: 'Flat Column',
    contacts: [
      { name: 'Neighbor Ned', relationship: 'neighbor', phone: '401-555-0002', sequence: 1 },
      { name: 'Daughter Dana', relationship: 'daughter', phone: '401-555-0001', email: 'dana@example.test', isPrimary: true },
    ] })
  assert.deepEqual(p.contacts.map(c => [c.name, c.isPrimary]), [['Daughter Dana', true], ['Neighbor Ned', false]])
  assert.equal(p.contacts[0].relationship, 'daughter')
  assert.ok(p.contacts[0].contactId, 'each contact has an id')
  assert.equal(p.emergencyContactName, 'Flat Column', 'the flat column still reads')
  const two = await vgCall('patchPerson', { personId: p.personId }, { token: staff,
    body: { contacts: [{ name: 'A', isPrimary: true }, { name: 'B', isPrimary: true }] } })
  assert.equal(two.status, 400, 'two primary contacts are rejected')
  const noName = await vgCall('patchPerson', { personId: p.personId }, { token: staff, body: { contacts: [{ relationship: 'son' }] } })
  assert.equal(noName.status, 400, 'a contact needs a name')
  const untouched = await vgCall('patchPerson', { personId: p.personId }, { token: staff, body: { nickname: 'CT' } })
  assert.equal(untouched.json.contacts.length, 2, 'omitting contacts on PATCH leaves them alone')
})
