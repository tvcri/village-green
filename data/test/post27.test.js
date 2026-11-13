// Builders added for migrations 28 to 33: contact variety, deceased people,
// volunteer pauses, trainings and positions, donors, the task user, and the
// load-path rules (uniform row keys, full truncation) that came with them.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildDataset, loadContent } from '../generator/data.js'
import { analyzeDrift } from '../generator/doctor.js'
import { BASE_DATE } from '../generator/env.js'
import { PRESERVED_TABLES, TABLE_ORDER } from '../generator/constants.js'

const TODAY = BASE_DATE.toISOString().slice(0, 10)
const build = (sizing = {}, seed = 20260630) => buildDataset(loadContent(), seed, sizing)

test('every row in a table sets the same keys (both load paths fill gaps with NULL)', () => {
  const ds = build()
  for (const t of TABLE_ORDER) {
    const rows = ds[t] || []
    if (!rows.length) continue
    const k0 = Object.keys(rows[0]).sort().join()
    for (const r of rows) assert.equal(Object.keys(r).sort().join(), k0, `${t} row ${JSON.stringify(r).slice(0, 80)}`)
  }
})

test('doctor: a column set on only some rows is an error', () => {
  const col = (name) => ({ name, generated: false, autoIncrement: false, required: false })
  const { errors } = analyzeDrift({ widget: [col('id'), col('flag')] }, { widget: [{ id: 1, flag: 1 }, { id: 2 }] }, ['widget'])
  assert.equal(errors.length, 1)
  assert.match(errors[0], /widget\.flag.*1 of 2 rows/)
})

test('seeding preserves only migration-owned catalogs, never a table the generator fills', () => {
  for (const t of ['role', 'role_permission', '_migrations', 'contact_method']) assert.ok(PRESERVED_TABLES.includes(t))
  for (const t of PRESERVED_TABLES) assert.ok(!TABLE_ORDER.includes(t), `${t} is both preserved and generated`)
  for (const t of ['donor', 'audit_event', 'sync_field', 'sync_hold', 'sync_run', 'sync_log', 'analytics_events']) {
    assert.ok(!PRESERVED_TABLES.includes(t), `${t} must be truncated`)
  }
})

test('the auto_complete task user is seeded, unacknowledged and not a login', () => {
  const ds = build()
  const task = ds.user_data.filter(u => u.taskName === 'auto_complete')
  assert.equal(task.length, 1)
  assert.equal(task[0].status, 'unavailable')
  assert.equal(task[0].username, '_task_auto_complete')
  assert.ok(!ds.privacy_acknowledgement.some(a => a.userId === task[0].userId))
  assert.ok(ds.user_data.filter(u => u.userId !== task[0].userId).every(u => u.status === 'available' && u.taskName === null))
})

test('contacts: invented, well-formed and varied', () => {
  const ds = build()
  const n = ds.person.length
  const share = (f) => ds.person.filter(f).length / n
  for (const p of ds.person) {
    for (const ph of [p.phone, p.cell]) if (ph !== null) assert.match(ph, /^\d{3}-555-\d{4}$/)
    if (p.email !== null) assert.match(p.email, /\.test$/)
    assert.match(p.zip, /^\d{5}$/)
  }
  assert.ok(share(p => p.cell && !p.phone) > 0.25, 'many people have only a cell')
  assert.ok(share(p => p.phone && !p.cell) > 0.1, 'some have only a landline')
  assert.ok(share(p => !p.email) > 0.05 && share(p => !p.email) < 0.25)
  assert.ok(share(p => p.unit) > 0.12)
  assert.ok(ds.person.some(p => p.suffix), 'some suffixes')
  assert.ok(ds.person.some(p => p.nickname && p.nickname.length < 8), 'some ordinary nicknames')
  // out of state only for non-members: a member's home is a request's pickup, written as RI
  const memberIds = new Set(ds.member.map(m => m.personId))
  const away = ds.person.filter(p => p.state !== 'RI')
  assert.ok(away.length > 0)
  for (const p of away) assert.ok(!memberIds.has(p.id), `${p.firstName} ${p.lastName} is a member out of state`)
  // logins keep their email: a VSS username is its volunteer's email
  const emails = new Set(ds.person.map(p => p.email))
  for (const u of ds.user_data.filter(u => u.username.endsWith('@residents.test'))) assert.ok(emails.has(u.username))
})

test('deceased: flag-and-date rule, none on upcoming or open requests, none with a login', () => {
  const ds = build()
  const dead = ds.person.filter(p => p.deceased)
  assert.ok(dead.length >= 2)
  assert.ok(dead.some(p => p.deceasedDate) && dead.some(p => !p.deceasedDate), 'dated and undated deaths')
  for (const p of ds.person) if (p.deceasedDate) assert.equal(p.deceased, 1, 'a date implies the flag (CHECK)')
  const deadIds = new Set(dead.map(p => p.id))
  for (const sr of ds.service_request) {
    for (const pid of [sr.memberPersonId, sr.volunteerPersonId]) {
      if (!deadIds.has(pid)) continue
      assert.ok(sr.serviceDate < TODAY && !['Open', 'Confirmed'].includes(sr.status), `request ${sr.id} has a deceased person`)
      const p = ds.person.find(x => x.id === pid)
      if (p.deceasedDate) assert.ok(sr.serviceDate < p.deceasedDate, `request ${sr.id} is after the death`)
    }
  }
  const emails = new Set(ds.user_data.map(u => u.username))
  for (const p of dead) assert.ok(!emails.has(p.email))
  // at least one reads Active on the member row but has left active_member (D2)
  assert.ok(ds.member.some(m => m.status === 'Active' && deadIds.has(m.personId)))
})

test('pauses: Active living volunteers, valid shapes, never covering an assigned request', () => {
  const ds = build()
  const vol = Object.fromEntries(ds.volunteer.map(v => [v.id, v]))
  const person = Object.fromEntries(ds.person.map(p => [p.id, p]))
  assert.ok(ds.volunteer_pause.length >= 1)
  assert.equal(new Set(ds.volunteer_pause.map(p => p.volunteerId)).size, ds.volunteer_pause.length)
  assert.ok(ds.volunteer_pause.some(p => p.scope === 'all') && ds.volunteer_pause.some(p => p.scope === 'window'))
  for (const vp of ds.volunteer_pause) {
    const v = vol[vp.volunteerId]
    assert.equal(v.status, 'Active')
    assert.equal(person[v.personId].deceased, 0)
    if (vp.scope === 'window') assert.ok(vp.startDate && vp.endDate)
    if (vp.startDate && vp.endDate) assert.ok(vp.startDate <= vp.endDate)
    const covers = (d) => (vp.startDate === null || d >= vp.startDate) && (vp.endDate === null || d <= vp.endDate)
    for (const sr of ds.service_request) {
      if (sr.volunteerPersonId === v.personId) assert.ok(!covers(sr.serviceDate), `request ${sr.id} falls in a pause`)
    }
  }
})

test('trainings and positions honor the scope rules', () => {
  const ds = build()
  const pos = Object.fromEntries(ds.position.map(p => [p.id, p]))
  const vol = Object.fromEntries(ds.volunteer.map(v => [v.id, v]))
  const person = Object.fromEntries(ds.person.map(p => [p.id, p]))
  assert.ok(ds.training.length && ds.position.length && ds.volunteer_training.length && ds.volunteer_position.length)
  const tKeys = ds.volunteer_training.map(t => `${t.volunteerId}|${t.trainingId}|${t.completedDate}`)
  assert.equal(new Set(tKeys).size, tKeys.length)
  for (const vp of ds.volunteer_position) {
    const p = pos[vp.positionId]
    const v = vol[vp.volunteerId]
    assert.equal(v.status, 'Active')
    if (p.scope === 'village') { assert.equal(vp.villageId, person[v.personId].villageId); assert.equal(vp.circleId, null) }
    if (p.scope === 'circle') {
      assert.equal(vp.villageId, null)
      assert.ok(ds.person_circle.some(pc => pc.personId === v.personId && pc.circleId === vp.circleId))
    }
    if (p.scope === 'federation') assert.ok(vp.villageId === null && vp.circleId === null)
  }
  // one Steering Committee seat per village
  const steering = ds.position.find(p => p.name === 'Steering Committee')
  const seats = new Set(ds.volunteer_position.filter(vp => vp.positionId === steering.id).map(vp => vp.villageId))
  assert.equal(seats.size, ds.village.length)
})

test('donors: default share, invented ids, couples share a constituent', () => {
  const ds = build()
  const n = ds.donor.length
  assert.ok(Math.abs(n - Math.round(ds.person.length * 0.2)) <= 1, `${n} donors`)
  assert.equal(new Set(ds.donor.map(d => d.personId)).size, n)
  for (const d of ds.donor) {
    assert.match(d.lglConstituentId, /^DEMO-\d{6}$/)
    if (d.lastGiftDate) assert.ok(d.lastGiftDate <= TODAY)
  }
  assert.ok(ds.donor.some(d => d.lastGiftDate === null))
  const byId = {}
  for (const d of ds.donor) (byId[d.lglConstituentId] ??= []).push(d.personId)
  for (const pids of Object.values(byId).filter(x => x.length > 1)) {
    assert.equal(pids.length, 2)
    assert.ok(ds.member.some(m => m.personId === pids[1] && m.primaryPersonId === pids[0]) ||
      ds.member.some(m => m.personId === pids[0] && m.primaryPersonId === pids[1]), 'only spouses share an id')
  }
})

test('donors: VG_DEMO_DONORS=0 seeds none and leaves everything else unchanged', () => {
  const on = build()
  const off = build({ donors: 0 })
  assert.equal(off.donor.length, 0)
  assert.equal(build({ donors: 7 }).donor.length, 7)
  for (const t of TABLE_ORDER.filter(t => t !== 'donor')) assert.deepEqual(off[t], on[t], `${t} changed with the donor knob`)
  assert.throws(() => build({ donors: -1 }), /VG_DEMO_DONORS/)
  assert.throws(() => build({ donors: 2.5 }), /VG_DEMO_DONORS/)
})

test('determinism: the same seed builds the same dataset; a new seed a different one', () => {
  const strip = (ds) => JSON.stringify(TABLE_ORDER.map(t => ds[t]))
  assert.equal(strip(build()), strip(build()))
  assert.notEqual(strip(build()), strip(build({}, 1)))
})
