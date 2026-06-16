# Meta Village — Design Spec

**Date:** 2026-06-16
**Branch:** meta-view

## Overview

A "Meta Village" feature that lets a user see Service Requests across all their granted villages in one view. Entry point is a button in the VillageList header. The cross-village SR list reuses the existing `ServiceRequestList` component in a new mode.

---

## 1. API

### OAS spec (`api/source/specification/village-green.yaml`)

Add parameters to the existing `getServiceRequests` operation (`GET /service-requests`):

- `status` — query, array of string, optional — same values as `getVillageServiceRequests`
- `villageId` — query, array of string, optional — filter to specific villages; omitting returns all granted villages
- `elevate` — query, boolean, optional — admin bypass, same pattern as `getVillages`

### Controller (`api/source/controllers/ServiceRequest.js`)

Replace the stub with:
1. Extract `status`, `villageId`, `elevate` from `req.query`
2. Validate `elevate` against `req.userObject.privileges.admin` (reject 403 if not admin)
3. Derive `villageIdsGranted = Object.keys(req.userObject.grants)`
4. Call `ServiceRequestService.getServiceRequests({ villageIdsGranted, elevate, status, villageId })`

### Service (`api/source/service/ServiceRequestService.js`)

New function `getServiceRequests({ villageIdsGranted, elevate, status, villageId })`:

- Base query identical to `getVillageServiceRequests` but:
  - Adds `sr.village_id AS villageId` and `v.name AS villageName` via a JOIN on `village v`
  - When `elevate=false`: `WHERE sr.village_id IN (villageIdsGranted)`
  - When `elevate=true`: no village WHERE clause
  - Optional additional `AND sr.village_id IN (villageId)` if `villageId` param provided
  - Optional `AND sr.status IN (status)` if `status` param provided (same cancelled-mapping logic as existing function)
- ORDER BY `sr.finish_at DESC`

---

## 2. Routing

New routes added to `client/src/router/index.js`:

| Name | Path | Component |
|---|---|---|
| `meta` | `/meta` | `MetaVillage` |
| `meta-service-requests` | `/meta/service-requests` | `ServiceRequestList` |

`ServiceRequestList` on the `meta-service-requests` route receives no `villageId` prop, triggering cross-village mode.

---

## 3. MetaVillage component

**File:** `client/src/features/MetaVillage/components/MetaVillage.vue`

- Minimal page: title and a single PrimeVue `<Button>` labeled "Service Requests"
- Button navigates to `{ name: 'meta-service-requests' }`
- No data fetching

---

## 4. VillageList changes

**File:** `client/src/features/VillageList/components/VillageList.vue`

- Add a header row above the card grid with the "Villages" title on the left and a PrimeVue `<Button>` labeled "Meta Village" right-justified
- Button navigates to `{ name: 'meta' }`

---

## 5. ServiceRequestList changes

**File:** `client/src/features/ServiceRequestList/components/ServiceRequestList.vue`

### Mode detection

Derive mode from `route.params.villageId` (a computed inside the component — no prop change needed, no router changes for the existing village route):

- **Village mode** (`route.params.villageId` present): existing behavior unchanged — calls `getVillageServiceRequests(villageId)`, client-side filtering
- **Meta mode** (`route.params.villageId` absent): calls `getServiceRequests({ status, villageId: villageFilter })` with server-side filtering; re-fetches on filter change

### Village column

- Inserted between Date and Service columns
- Visible only in meta mode (`v-if="!route.params.villageId"`)

### Village filter (meta mode only)

- Dropdown in the filter panel populated from `getVillages()` (user's granted villages)
- Sends selected village IDs as `villageId` array param to `getServiceRequests`
- Shown only in meta mode (`!route.params.villageId`)

### Row navigation

Row click always navigates to `service-request-detail` using `row.villageId`. In meta mode, appends `?from=meta` to the route query so breadcrumbs can link back correctly.

---

## 6. API client

**File:** `client/src/features/ServiceRequestList/api/serviceRequestApi.js`

New function:

```js
export const getServiceRequests = ({ status, villageId } = {}) => {
  const params = {}
  if (status?.length) params.status = status
  if (villageId?.length) params.villageId = villageId
  return apiCall('getServiceRequests', params)
}
```

Null/undefined params are omitted — not stringified — ensuring the API receives only active filters.

---

## 7. Breadcrumbs

**File:** `client/src/components/Breadcrumbs.vue`

Add two cases to the route `switch`:

```
case 'meta':
  // Villages / Meta
  crumbs.push({ label: 'Meta' })

case 'meta-service-requests':
  // Villages / Meta / Service Requests
  crumbs.push({ label: 'Meta', route: { name: 'meta' } })
  crumbs.push({ label: 'Service Requests' })
```

For `service-request-detail`, check `route.query.from`:
- If `from=meta`: render `Villages / Meta / Service Requests / Request` with "Service Requests" linking to `{ name: 'meta-service-requests' }`
- Otherwise: existing behavior (village-scoped back-link)

---

## Out of scope

- MetaVillage detail charts (Members, Volunteers counts across villages)
- Pagination for the cross-village SR list
- Server-side filtering for the village-scoped `ServiceRequestList` (unchanged)
