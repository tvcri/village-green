# Security findings asserted by this suite

This suite intentionally asserts the **correct/secure** behavior. Where the current
code is insecure or broken, the corresponding tests **fail (red)** on purpose — a red
run is expected until the underlying issues are fixed, and each red goes green with
no edit needed when its fix lands. Each finding maps to specific tests.

## Status 2026-07-20: findings #1–#6 fixed by the RBAC rework (#56) — verified live

The original six findings (recorded below for history) were all resolved by the
capability-role refactor, which added per-village permission checks
(`hasPermission(perm, {villageId})`) to every controller path this register
covered. Each former RED probe has been converted to a GREEN assertion (with a
"fixed by #56" comment at the site) and verified against a live run on
2026-07-20:

| # | Was | Now |
|---|-----|-----|
| 1 | Cross-village reads via by-ID endpoints (`GET /persons/{id}`, `/service-requests/{id}`) leaked address/phone/email | **403** — perm-checked after fetch (`tests/persons/authz.test.js`, `tests/service-request/authz.test.js`). Note the semantics changed from the suggested 404 to 403, and the check runs *before* existence on nested `/villages/{id}/...` routes. |
| 2 | Cross-village SR writes ungated | **403** — `sr:write` on the target/existing village (`tests/service-request/authz.test.js`); village roles hold no writes at all now |
| 3 | Multi-value `villageId` filter double-wrapped in `getServiceRequests` → 500 | Fixed — bare-array bind (`tests/service-request/meta-rollup.test.js` exercises the multi-value union green) |
| 4 | Same double-wrap in `FriendService.getFriends` → 500 | Fixed — same shape (`tests/friends/list.test.js`) |
| 5 | Person writes (create/patch/delete + member/volunteer sub-resources) ungated | **403** — `person:write`/`member:write`/`volunteer:write` on the person's village, plus a destination-village check when a patch moves a person (`tests/persons/write.test.js`, `tests/members/lifecycle.test.js`, `tests/volunteers/lifecycle.test.js`) |
| 6 | Village write endpoints had no gate (masked by WIP bugs) | **Gated and working** — `village:write` per village; `createVillage` is admin+elevate (`village:create`); the WIP 500/404 bugs are also gone (`tests/villages/crud.test.js`) |

## Status 2026-07-21: findings A and B fixed by #69 — verified

Both were found by this suite and fixed upstream in production code. Their RED
probes flipped GREEN on the fix commit alone, with no test edit — the intended
behavior of the red-until-fixed convention.

| # | Was | Now |
|---|-----|-----|
| A | `sqlGrantees` pushed `[villageIds]` into `IN (?)`, rendering `IN ((1, 2))` → `ER_OPERAND_COLUMNS` → **500** for any caller with grants on 2+ villages hitting `GET /villages?projection=statistics`. Federation (allVillages) and single-village callers dodged it. | **Fixed** — flat bind. Green in `tests/villages/projections.test.js` and `api/source/test/serviceUtils.test.js`. |
| B | `generateSchema.sh`'s `static_data_tables` was never updated for `0013-rbac-roles.js`, so the scaffold dump marked 0013 executed while carrying none of its `role` / `role_permission` rows — a fresh install could grant nobody anything (every `role_grant` insert hit `fk_role_grant_role`). Deploy-blocking. | **Fixed** — `role role_permission` added to the list and both artifacts regenerated (they had also fallen three migrations behind, 0015–0017). Green in `tests/smoke/state-and-spec.test.js`. The `seedRoleCatalog()` workaround in `setup/seed.js` is deleted; `assertRoleCatalog()` now fails fast if a scaffold ever ships an empty catalog again. |

Related, same root cause as B: `current/30-vg-views.sql` was **deleted**.
`mysqldump` already emits `active_member` / `active_volunteer` into
`10-vg-tables.sql`, so fresh installs get them without migration 0006 running.
Worse, `30-` loaded last and its `SELECT *` form overwrote the dump's
column-expanded definitions, reintroducing the add-a-column-and-it-is-invisible
trap. The load-order problem it worked around is fixed by the `readdir().sort()`
in `setupInitialSchema`.

## Open findings

### C. `iss` claim is never validated (characterization)

`jwt.verify` is called without an `issuer` option, so a token signed by the
trusted key but carrying a foreign `iss` is accepted. Low severity while the
JWKS is the single trust root; would matter if key material were ever shared.

- Characterized in `tests/auth/authentication.test.js` ("foreign issuer claim
  is ACCEPTED").

---

### What is verified as already-correct (GREEN)

- Unfiltered list reads are a federation-scope privilege: village users must
  pass `villageId ⊆ grants` (403 otherwise, including mixed granted+ungranted
  filters); `nogrants` users are denied outright by the deny-by-default staff
  gate (`utils/accessGates.js`).
- Village roles (1–3) are read-only; every write path 403s for them —
  including in their *own* village. Writes live with federation Staff (5),
  Service Coordinator (7, sr:write only), or Admin (4).
- Field-level reads are permission-gated: `member:read_financial`
  (householdDues et al.) reaches Village Lead/staff but not roles 1–2, board,
  or sc; `member:read_inactive` distinguishes staff from board.
- Elevation is a real gate on the admin surface (`user:admin`, `grant:admin`,
  `app:admin`, `village:create`): admin without `elevate=true` → 403;
  non-holders with `elevate=true` → 403.
- Group grants (`role_grant.userGroupId`) flow to member users and revoke
  cleanly; grant writes are admin+elevate only (staff denied).
- Authentication: missing/expired/tampered/insecure-kid tokens rejected;
  audience enforced; scope enforcement (OutOfScopeError) fires before role
  checks and is distinguishable in tests.
- The privacy-ack gate fails closed for all users (federation roles included)
  with the allowlist intact.
