import { test } from 'node:test'
import assert from 'node:assert/strict'
import { withDb } from '../../lib/db.js'
import { taskUsers, villages, persons } from '../../setup/fixtures.js'
import { auditRows } from './lib.js'

// evt_auto_complete_service_requests (migration 0024) ages stale requests on a
// nightly schedule. It is the only writer that mutates service_request without
// an API request behind it, so it resolves the task's user_data row by taskName
// and writes that userId into audit_event — the same attribution shape a human
// actor gets.
//
// The event body is executed here via a temporary procedure built from the
// stored EVENT_DEFINITION rather than a copy of the SQL: the assertion must
// cover what the migration actually installed, not a paraphrase of it that can
// drift.
// The event is village-blind: it sweeps EVERY stale request in the schema,
// including other suites' fixtures (srM4 is a deliberately-Open 2026-06-04
// errand the metrics tests assert is uncounted). The harness DB is shared and
// never reset between files, so running the body would silently rewrite those
// fixtures — four metrics tests went red exactly that way.
//
// So: snapshot every row the body could touch, run it, then restore anything
// that was not this test's own. The event's real behaviour is still exercised
// end to end; only the blast radius is contained.
async function runEventBody (conn, ownIds = []) {
  const [[row]] = await conn.query(
    `SELECT EVENT_DEFINITION d FROM information_schema.EVENTS
     WHERE EVENT_SCHEMA = DATABASE() AND EVENT_NAME = 'evt_auto_complete_service_requests'`)
  assert.ok(row?.d, 'evt_auto_complete_service_requests is not installed in this schema')

  const [before] = await conn.query(
    `SELECT id, status FROM service_request
     WHERE status IN ('Confirmed', 'Open') AND serviceDate <= CURDATE() - INTERVAL 1 DAY`)
  const foreign = before.filter(r => !ownIds.includes(r.id))

  await conn.query('DROP PROCEDURE IF EXISTS _test_run_autocomplete')
  await conn.query('CREATE PROCEDURE _test_run_autocomplete() ' + row.d)
  try {
    await conn.query('CALL _test_run_autocomplete()')
  } finally {
    await conn.query('DROP PROCEDURE IF EXISTS _test_run_autocomplete')
    // Restore other suites' fixtures and drop the audit rows written for them.
    for (const r of foreign) {
      await conn.query('UPDATE service_request SET status = ? WHERE id = ?', [r.status, r.id])
      await conn.query(
        'DELETE FROM audit_event WHERE entityType = ? AND entityId = ? AND userId = ?',
        ['serviceRequest', r.id, (await taskUserId(conn))])
    }
  }
}

async function taskUserId (conn) {
  const [rows] = await conn.query("SELECT userId FROM user_data WHERE taskName = 'auto_complete'")
  return rows[0]?.userId ?? -1
}

// A stale request the event must sweep: serviceDate strictly before today, so
// it satisfies `serviceDate <= CURDATE() - INTERVAL 1 DAY` regardless of when
// the suite runs.
//
// Seeded into the SCRATCH village, never quahog: the event is village-blind
// and sweeps every stale request in the schema, so these rows would otherwise
// land in the metrics suite's aggregations (they did — four metrics tests went
// red counting this file's Unmatched row).
async function insertStaleRequest (conn, { status, requestNumber }) {
  const [res] = await conn.query(
    `INSERT INTO service_request
       (requestNumber, villageId, memberPersonId, status, serviceName, serviceDate, createdAt)
     VALUES (?, ?, ?, ?, 'Errand', CURDATE() - INTERVAL 3 DAY, NOW())`,
    [requestNumber, villages.scratch.id, persons.quahogMember.id, status])
  return res.insertId
}

test('the auto-complete event audits its own transitions under the task user', async () => {
  const confirmedId = await withDb(c => insertStaleRequest(c, { status: 'Confirmed', requestNumber: 9001 }))
  const openId = await withDb(c => insertStaleRequest(c, { status: 'Open', requestNumber: 9002 }))

  await withDb(c => runEventBody(c, [confirmedId, openId]))

  const [confirmedNow, openNow] = await withDb(async (conn) => {
    const [rows] = await conn.query(
      'SELECT id, status FROM service_request WHERE id IN (?, ?) ORDER BY FIELD(id, ?, ?)',
      [confirmedId, openId, confirmedId, openId])
    return rows
  })
  assert.equal(confirmedNow.status, 'Completed', 'stale Confirmed request should age to Completed')
  assert.equal(openNow.status, 'Unmatched', 'stale Open request should age to Unmatched')

  const cRows = await auditRows('serviceRequest', confirmedId)
  assert.equal(cRows.length, 1, 'exactly one audit row for the Confirmed -> Completed transition')
  assert.equal(cRows[0].action, 'update')
  assert.deepEqual(cRows[0].changes, { diff: { status: { old: 'Confirmed', new: 'Completed' } } })

  const oRows = await auditRows('serviceRequest', openId)
  assert.equal(oRows.length, 1, 'exactly one audit row for the Open -> Unmatched transition')
  assert.deepEqual(oRows[0].changes, { diff: { status: { old: 'Open', new: 'Unmatched' } } })

  // Attribution resolves through taskName, never a hardcoded id: the userId the
  // event wrote must be the seeded task row, and that row must be one the auth
  // gate refuses (status 'unavailable', no grants).
  const actor = await withDb(async (conn) => {
    const [rows] = await conn.query(
      `SELECT ud.userId, ud.username, ud.status, ud.taskName,
              (SELECT COUNT(*) FROM role_grant rg WHERE rg.userId = ud.userId) AS grantCount
       FROM user_data ud WHERE ud.taskName = 'auto_complete'`)
    return rows[0]
  })
  assert.ok(actor, 'the auto_complete task user row must exist or the event silently no-ops')
  assert.equal(cRows[0].userId, actor.userId, 'audit row must be attributed to the task user')
  assert.equal(oRows[0].userId, actor.userId)
  assert.equal(actor.username, taskUsers.autoComplete.username)
  assert.equal(actor.status, 'unavailable', 'the task actor must not be able to authenticate')
  assert.equal(Number(actor.grantCount), 0, 'the task actor must hold no grants')
})

test('a second run writes nothing: the transitions are already applied', async () => {
  const id = await withDb(c => insertStaleRequest(c, { status: 'Confirmed', requestNumber: 9003 }))
  await withDb(c => runEventBody(c, [id]))
  assert.equal((await auditRows('serviceRequest', id)).length, 1)

  // The predicates match on the PRE-transition status, so a re-run finds
  // nothing to do — no duplicate audit row for an unchanged record.
  await withDb(c => runEventBody(c, [id]))
  assert.equal((await auditRows('serviceRequest', id)).length, 1,
    'a re-run must not write a second audit row for an already-transitioned request')
})

// The body's atomicity guarantee rests on it running inside an explicit
// transaction: MySQL does NOT wrap an event body in one, so without
// START TRANSACTION/COMMIT each statement would autocommit and a failure
// between an INSERT and its UPDATE would leave the trail asserting a
// transition that never happened.
//
// Asserted structurally, against the stored definition. Inducing a real
// mid-body failure needs privileges the harness DB user does not have
// (CREATE TRIGGER / CREATE PROCEDURE both require SUPER here), and a CHECK
// constraint cannot be added to a shared audit_event that already holds
// 'Unmatched' rows. The rollback itself was verified manually against a copy
// of production data (see the migration's commit message).
test('the event body is transactional and rolls back on failure', async () => {
  const body = await withDb(async (conn) => {
    const [[row]] = await conn.query(
      `SELECT EVENT_DEFINITION d FROM information_schema.EVENTS
       WHERE EVENT_SCHEMA = DATABASE() AND EVENT_NAME = 'evt_auto_complete_service_requests'`)
    return row?.d ?? ''
  })
  assert.ok(body, 'evt_auto_complete_service_requests is not installed in this schema')

  assert.match(body, /START TRANSACTION/i,
    'the body must open an explicit transaction — MySQL does not wrap event bodies in one')
  assert.match(body, /COMMIT/i, 'the body must commit its transaction')
  assert.match(body, /EXIT HANDLER FOR SQLEXCEPTION/i,
    'the body must install an error handler so a failure cannot leave work half-applied')
  assert.match(body, /ROLLBACK/i, 'the error handler must roll back')
  assert.match(body, /RESIGNAL/i,
    're-raise after rollback: a failed run must be loud, never silent')

  // The rollback must cover BOTH transitions, so the trail and the data can
  // never disagree: every INSERT and UPDATE has to sit between the
  // START TRANSACTION and the COMMIT.
  const start = body.search(/START TRANSACTION/i)
  const commit = body.search(/COMMIT/i)
  const writes = [...body.matchAll(/\b(INSERT INTO audit_event|UPDATE service_request)\b/gi)]
  assert.equal(writes.length, 4, 'expected two audit INSERTs and two status UPDATEs')
  for (const w of writes) {
    assert.ok(w.index > start && w.index < commit,
      `"${w[0]}" must run inside the transaction, not outside it`)
  }
})
