import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vgCall } from '../../lib/ops.js'
import { tokens } from '../../lib/context.js'
import { villages } from '../../setup/fixtures.js'

// Village writes, post-#56 RBAC:
//   - createVillage is elevation-gated: village:create is federation-only and
//     held solely by admin's wildcard, so admin + ?elevate=true is the ONLY
//     caller (staff lacks it; elevate is declared on this op alone).
//   - patchVillage / deleteVillage need village:write on the target ->
//     staff (federation-wide) or admin on a plain call. Village-scope roles
//     (1-3) are read-only, so even a Village Lead cannot write its own village.
// The pre-#56 WIP bugs (createVillage ReferenceError; grant-blind existence
// lookups 404ing patch/delete for everyone) are fixed, and finding #6 (no
// authz gate on village writes) is closed by #56 — the denials below are real
// guards now, so the old literal-URL RED probes are retired for vgCall greens.

test('createVillage by a non-admin is denied (even with elevate=true)', async () => {
  const { status } = await vgCall('createVillage', { elevate: 'true' }, {
    token: tokens.users.full_v1, body: { name: 'Unauthorized Village (authz probe)' },
  })
  assert.equal(status, 403)
})

test('createVillage by admin without elevate -> 403 (elevation is mandatory)', async () => {
  const { status } = await vgCall('createVillage', {}, {
    token: tokens.users.admin, body: { name: 'Unelevated Village (authz probe)' },
  })
  assert.equal(status, 403)
})

test('createVillage by staff is denied (village:create is not part of village:write)', async () => {
  const { status } = await vgCall('createVillage', { elevate: 'true' }, {
    token: tokens.users.staff, body: { name: 'Staff Village (authz probe)' },
  })
  assert.equal(status, 403)
})

test('patchVillage by village-role users is denied (roles 1-3 are read-only)', async () => {
  // No-op same-value patches: even an insecure write would change nothing.
  const cross = await vgCall('patchVillage', { villageId: villages.quahog.id }, {
    token: tokens.users.full_v2, body: { name: villages.quahog.name },
  })
  assert.equal(cross.status, 403, 'cross-village patch denied')

  // A Village Lead (role 3) holds every read on its village but no write.
  const ownLead = await vgCall('patchVillage', { villageId: villages.quahog.id }, {
    token: tokens.users.owner_v1, body: { name: villages.quahog.name },
  })
  assert.equal(ownLead.status, 403, 'own-village patch denied for a Village Lead')
})

test('deleteVillage by a village-role user is denied', async () => {
  const { status } = await vgCall('deleteVillage', { villageId: villages.quahog.id }, {
    token: tokens.users.owner_v1,
  })
  assert.equal(status, 403)
})

test('patchVillage checks permission before existence: staff on a missing id -> 404', async () => {
  const { status } = await vgCall('patchVillage', { villageId: 999999 }, {
    token: tokens.users.staff, body: { name: 'Ghost Village' },
  })
  assert.equal(status, 404)
})

test('village lifecycle: admin+elevate creates, staff renames, admin deletes', async () => {
  const created = await vgCall('createVillage', { elevate: 'true' }, {
    token: tokens.users.admin, body: { name: 'Disposable Village (crud)' },
  })
  assert.equal(created.status, 201)
  const id = created.json.villageId
  assert.ok(id, 'create echoes a villageId')
  assert.equal(created.json.name, 'Disposable Village (crud)')

  try {
    // staff holds federation-wide village:write — no elevation on patch/delete
    const renamed = await vgCall('patchVillage', { villageId: id }, {
      token: tokens.users.staff, body: { name: 'Disposable Village (renamed)' },
    })
    assert.equal(renamed.status, 200)
    assert.equal(renamed.json.name, 'Disposable Village (renamed)')
  } finally {
    // Cleanup must run even if the patch assertions fail: a leftover village
    // would linger in federation-wide list responses for the rest of the run.
    const del = await vgCall('deleteVillage', { villageId: id }, { token: tokens.users.admin })
    assert.equal(del.status, 200)
  }

  const after = await vgCall('getVillage', { villageId: id }, { token: tokens.users.staff })
  assert.equal(after.status, 404, 'deleted village is gone')
})
