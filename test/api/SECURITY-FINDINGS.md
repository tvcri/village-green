# Security findings asserted by this suite

This suite intentionally asserts the **correct/secure** behavior. Where the current
code is insecure, the corresponding tests **fail (red)** on purpose — a red run here is
expected until the underlying issues are fixed. When a fix lands, the test goes green
with no edit needed. Each finding below maps to specific tests.

## 1. Cross-village information exposure via by-ID endpoints (RED)

`GET /service-requests/{id}` ([service/ServiceRequestService.js](../../api/source/service/ServiceRequestService.js)
`getServiceRequest`) and `GET /persons/{id}` ([service/PersonService.js](../../api/source/service/PersonService.js)
`getPerson`) apply **no village-grant filtering**. Any authenticated user holding the read
scope can fetch a record from a village they have no grant on — including, for service
requests, the member's/volunteer's home address, phone, and email via
`?projection=memberAddress` / `?projection=volunteerAddress`.

The **list** endpoints are grant-filtered; only the single-record-by-ID paths leak.

- Asserted in: `tests/service-request/authz.test.js`, `tests/persons/authz.test.js`
- Expected secure behavior: **404** for a record outside the caller's grants (matching the
  existing nested-route convention, where `GET /villages/{id}/...` 404s for an ungranted
  village). If the team prefers 403, update the assertion when the guard is added.

## 2. Cross-village writes via by-ID endpoints (RED)

`POST /service-requests` (`createServiceRequest`) and `PATCH /service-requests/{id}`
(`patchServiceRequest`) do not check that the caller has a grant on the target village, so
a user can create a request in, or modify a request belonging to, a village they don't
administer.

- Asserted in: `tests/service-request/authz.test.js`
- Expected secure behavior: **403/404** for a village outside the caller's grants.

## 3. Multi-value `villageId` filter is mis-bound (RED, correctness not security)

In `getServiceRequests`, the client `villageId` filter is bound as `[villageId]` where
`villageId` is already an array
([ServiceRequestService.js:194](../../api/source/service/ServiceRequestService.js#L194)),
double-wrapping it. A single value works by accident; **multiple** selected villages render
a nested row-constructor — the generated SQL is `sr.village_id IN (('1', '2'))` — which
MySQL rejects with `ER_OPERAND_COLUMNS` ("Operand should contain 1 column(s)"), so the
endpoint returns **500**. This is the path the meta view uses when more than one village is
selected.

- Asserted in: `tests/service-request/meta-rollup.test.js`
- Note: not an information-exposure issue (the grant filter is always ANDed on top, so it
  can only *under*-return, never leak), but a correctness bug.

## 4. Multi-value `villageId` filter on `/friends` is mis-bound (RED, correctness not security)

`FriendService.getFriends` ([FriendService.js](../../api/source/service/FriendService.js))
carries the **same defect as #3**: the client `villageId` filter is bound as `[villageId]`
where `villageId` is already an array. With more than one village selected
(`?villageId=1&villageId=2`) the generated SQL becomes `fcv.villageId IN (('1', '2'))`, which
MySQL rejects with `ER_OPERAND_COLUMNS`, so the endpoint returns **500**. A single value works
by accident.

- Asserted in: `tests/friends/list.test.js`
- Note: like #3, the caller's grant filter is always ANDed on top, so this can only
  *under*-return, never leak — a correctness bug, not an exposure.

## 5. Cross-village person writes via the Person endpoints (RED)

The Person controller ([controllers/Person.js](../../api/source/controllers/Person.js))
applies **no village-grant check** on any write path:

- `POST /persons` (`createPerson`) trusts `body.villageId`, so a caller can inject a person
  into a village they hold no grant on.
- `PATCH /persons/{id}` (`patchPerson`) and `DELETE /persons/{id}` (`deletePerson`) resolve
  the row with a grant-blind `PersonService.getPerson`, so a caller can modify or delete any
  person by id — including persons in villages they do not administer.

Same class as #2 (cross-village writes), for the person resource.

- Asserted in: `tests/persons/write.test.js`
- Expected secure behavior: **403/404** for a person/village outside the caller's grants.

---

### What is verified as already-correct (GREEN)

- List endpoints filter to the caller's granted villages; `nogrants` users see nothing.
- The meta roll-up union is exactly the caller's granted villages; a client-supplied
  `villageId` can only *narrow within* grants, never expand scope (grant filter is always ANDed).
- Nested routes (`GET /villages/{id}/...`) 404 for an ungranted village.
- `elevate=true` is admin-only; an admin without `elevate` sees only granted villages (none).
- Authentication: missing/expired/tampered/insecure-kid tokens are rejected; scope
  enforcement distinguishes read from write.
