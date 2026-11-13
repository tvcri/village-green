import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'
import { withDb } from '../../lib/db.js'
import { villages, persons } from '../../setup/fixtures.js'

// GET /sync/changes: which persons changed after an audit id, from audit_event.
// The harness DB is shared across files, so every test starts its window at
// the highest auditId ALLOCATED so far (the AUTO_INCREMENT counter), not the
// highest visible: a rolled-back write elsewhere leaves a gap the feed would
// otherwise wait on. The gap wait is the default (VG_SYNC_CHANGE_GAP_SECONDS);
// an old createdAt stands in for "the wait has passed".
const sync = tokens.users.sync
const staff = tokens.users.staff
const admin = tokens.users.admin
const uniq = (s) => `${s}${Date.now()}${Math.round(Math.random() * 1e6)}`

const maxAuditId = async () => withDb(async (db) => {
  await db.query('SET SESSION information_schema_stats_expiry = 0')
  const [[{ n }]] = await db.query(
    `SELECT AUTO_INCREMENT AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'audit_event'`)
  return Number(n) - 1
})
const nickname = (personId, extra = '') => [
  `INSERT INTO audit_event (entityType, entityId, action, userId, changes${extra ? ', createdAt' : ''})
   VALUES ('person', ?, 'update', 10, JSON_OBJECT('diff', JSON_OBJECT('nickname', JSON_OBJECT('old', NULL, 'new', 'x')))${extra ? `, ${extra}` : ''})`,
  [Number(personId)],
]
// Age a row past the gap wait, so a gap below it reads as a rollback.
const age = (auditId) => withDb(db => db.query('UPDATE audit_event SET createdAt = NOW(3) - INTERVAL 1 HOUR WHERE auditId = ?', [auditId]))
const feed = (after, extra = {}, token = sync) => vgCall('getSyncChanges', { after, ...extra }, { token })
// Entity ids are strings, as everywhere in the API; the cursor is an integer.
const changesFor = (json, personId) => json.persons.find(p => p.personId === String(personId))?.changes

async function makePerson () {
  const res = await vgCall('createPerson', {}, { token: staff, body: { villageId: null, firstName: 'Feed', lastName: uniq('Change') } })
  assert.equal(res.status, 201)
  return res.json.personId
}

test('reports a person update with field names and no values', async () => {
  const personId = await makePerson()
  const after = await maxAuditId()
  const email = `${uniq('feed')}@example.test`
  const patch = await vgCall('patchPerson', { personId }, { token: staff, body: { email, phone: '401-555-0199' } })
  assert.equal(patch.status, 200)
  const res = await feed(after)
  assert.equal(res.status, 200)
  assert.deepEqual(changesFor(res.json, personId), [{ entityType: 'person', actions: ['update'], fields: ['email', 'phone'] }])
  const raw = JSON.stringify(res.json)
  assert.ok(!raw.includes(email), 'new value is not in the feed')
  assert.ok(!raw.includes('401-555-0199'), 'new phone is not in the feed')
})

test('reports member and donor changes under the person', async () => {
  const personId = String(persons.quahogMember.id)
  const before = await vgCall('getPerson', { personId, projection: ['member'] }, { token: staff })
  assert.equal(before.status, 200)
  const originalNotes = before.json.member.serviceNotes ?? null
  const after = await maxAuditId()
  try {
    assert.equal((await vgCall('putPersonDonor', { personId }, { token: admin, body: { lglConstituentId: '710001' } })).status, 200)
    assert.equal((await vgCall('patchPersonMember', { personId }, { token: staff, body: { serviceNotes: uniq('feed note') } })).status, 200)
    const res = await feed(after)
    assert.equal(res.status, 200)
    const changes = changesFor(res.json, personId)
    assert.deepEqual(changes.find(c => c.entityType === 'donor'), { entityType: 'donor', actions: ['create'], fields: [] })
    assert.deepEqual(changes.find(c => c.entityType === 'member'), { entityType: 'member', actions: ['update'], fields: ['serviceNotes'] })
  } finally {
    await vgCall('deletePersonDonor', { personId }, { token: admin })
    await vgCall('patchPersonMember', { personId }, { token: staff, body: { serviceNotes: originalNotes } })
  }
})

test('deleted donor row still maps to its person', async () => {
  const personId = await makePerson()
  const after = await maxAuditId()
  assert.equal((await vgCall('putPersonDonor', { personId }, { token: admin, body: { lglConstituentId: '710002' } })).status, 200)
  assert.equal((await vgCall('deletePersonDonor', { personId }, { token: admin })).status, 204)
  const res = await feed(after)
  assert.equal(res.status, 200)
  assert.deepEqual(changesFor(res.json, personId), [{ entityType: 'donor', actions: ['create', 'delete'], fields: [] }])
})

test('cursor advances past non-person rows', async () => {
  const after = await maxAuditId()
  const sr = await vgCall('createServiceRequest', {}, { token: tokens.users.sc, body: {
    villageId: String(villages.quahog.id), memberPersonId: String(persons.quahogMember.id),
    serviceName: 'Disposable ride', serviceDate: '2026-07-11',
  } })
  assert.equal(sr.status, 201)
  const srAuditId = await maxAuditId()
  try {
    const res = await feed(after)
    assert.equal(res.status, 200)
    assert.ok(res.json.lastAuditId >= srAuditId, 'cursor passed the service request row')
    assert.equal(res.json.more, false)
  } finally {
    await vgCall('deleteServiceRequest', { serviceRequestId: sr.json.serviceRequestId ?? sr.json.id }, { token: tokens.users.sc })
  }
})

test('paging with limit covers every row once', async () => {
  const a = await makePerson()
  const b = await makePerson()
  const after = await maxAuditId()
  const edits = [
    [a, { firstName: 'Ada' }], [b, { firstName: 'Bea' }], [a, { phone: '401-555-0110' }],
    [b, { cell: '401-555-0111' }], [a, { email: `${uniq('pg')}@example.test` }],
  ]
  for (const [personId, body] of edits) {
    assert.equal((await vgCall('patchPerson', { personId }, { token: staff, body })).status, 200)
  }
  const last = await maxAuditId()
  let cursor = after
  const seen = new Map()
  let pages = 0
  for (;;) {
    const res = await feed(cursor, { limit: 2 })
    assert.equal(res.status, 200)
    pages++
    for (const p of res.json.persons) {
      for (const c of p.changes) {
        assert.equal(typeof p.personId, 'string')
        const key = p.personId
        seen.set(key, [...(seen.get(key) ?? []), ...c.fields])
      }
    }
    assert.ok(res.json.lastAuditId > cursor || !res.json.more, 'cursor moves while more is true')
    cursor = res.json.lastAuditId
    if (!res.json.more) break
  }
  assert.equal(pages, 3)
  assert.equal(cursor, last)
  // A firstName edit also changes the generated displayName/fullName columns,
  // which the audit trail records like any other column.
  assert.deepEqual([...new Set(seen.get(String(a)))].sort(), ['displayName', 'email', 'firstName', 'fullName', 'phone'])
  assert.deepEqual([...new Set(seen.get(String(b)))].sort(), ['cell', 'displayName', 'firstName', 'fullName'])
})

test('the cursor stops below a write that has not committed yet', async () => {
  const p1 = await makePerson()
  const p2 = await makePerson()
  const after = await maxAuditId()
  const open = await withDb(async (db) => {
    await db.beginTransaction()
    const [r] = await db.query(...nickname(p1))
    // A later write commits while the first is still open.
    const later = await withDb(async (db2) => (await db2.query(...nickname(p2)))[0].insertId)
    const held = await feed(after)
    await db.commit()
    return { auditId: r.insertId, later, held }
  })
  assert.equal(open.held.status, 200)
  assert.equal(changesFor(open.held.json, p2), undefined, 'the committed row behind the open one waits')
  assert.equal(open.held.json.lastAuditId, after, 'cursor stays below the open write')
  const res = await feed(after)
  assert.deepEqual(changesFor(res.json, p1), [{ entityType: 'person', actions: ['update'], fields: ['nickname'] }])
  assert.deepEqual(changesFor(res.json, p2), [{ entityType: 'person', actions: ['update'], fields: ['nickname'] }])
  assert.equal(res.json.lastAuditId, open.later)
})

test('a gap is waited on, then passed once the row after it is old', async () => {
  const p1 = await makePerson()
  const after = await maxAuditId()
  await withDb(async (db) => {
    await db.beginTransaction()
    await db.query(...nickname(p1))
    await db.rollback()
  })
  const auditId = await withDb(async (db) => (await db.query(...nickname(p1)))[0].insertId)
  try {
    let res = await feed(after)
    assert.equal(changesFor(res.json, p1), undefined, 'a fresh gap may still be an open write')
    assert.equal(res.json.lastAuditId, after)
    await age(auditId)
    res = await feed(after)
    assert.deepEqual(changesFor(res.json, p1), [{ entityType: 'person', actions: ['update'], fields: ['nickname'] }])
    assert.equal(res.json.lastAuditId, auditId)
  } finally {
    await age(auditId)
  }
})

test('rows reach the feed at once when there is no gap', async () => {
  const p1 = await makePerson()
  const after = await maxAuditId()
  const auditId = await withDb(async (db) => (await db.query(...nickname(p1, 'NOW(3) + INTERVAL 1 HOUR')))[0].insertId)
  const res = await feed(after)
  assert.deepEqual(changesFor(res.json, p1), [{ entityType: 'person', actions: ['update'], fields: ['nickname'] }])
  assert.equal(res.json.lastAuditId, auditId)
})

test('staff is refused, admin is allowed', async () => {
  assert.equal((await feed(0, { limit: 1 }, staff)).status, 403)
  assert.equal((await feed(0, { limit: 1 }, admin)).status, 200)
})

test('a token without vg:sync is out of scope', async () => {
  const res = await feed(0, { limit: 1 }, tokens.special.syncNoScope)
  assert.equal(res.status, 403)
})

test('empty scan returns after as the cursor', async () => {
  const after = await maxAuditId()
  const res = await feed(after)
  assert.equal(res.status, 200)
  assert.deepEqual(res.json, { lastAuditId: after, more: false, persons: [] })
})
