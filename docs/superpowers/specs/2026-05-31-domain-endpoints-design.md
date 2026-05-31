# OAS Design Spec: Domain Endpoints for Person, Member, Volunteer, ServiceRequest

**Date:** 2026-05-31  
**Scope:** OpenAPI Specification (OAS) updates only — endpoints and schemas for CRUD operations on four core domain tables.

---

## Overview

The Village Green project manages a village federation with support roles (members, volunteers) and service requests. The MySQL schema defines four core tables:
- `person` — base entity for all people
- `member` — a person who receives services
- `volunteer` — a person who provides services
- `service_request` — a request for a service

This spec defines REST endpoints and request/response schemas for CRUD operations on these tables. The spec uses the project's established patterns:
- Controller routing: `tags[0]` → controller filename (PascalCase)
- Function routing: `operationId` → exported function name on controller
- OAuth scopes: `vg:<resource>` (write), `vg:<resource>:read` (read)

---

## Endpoint Design

### Controllers and Paths

Four new controllers, one per resource. Junction tables (`person_village`, `volunteer_capability`) are managed via sub-resource endpoints on the parent entity.

| Controller | Base Path | OAuth Scope (write/read) |
|---|---|---|
| `Person` | `/persons` | `vg:person` / `vg:person:read` |
| `Member` | `/members` | `vg:member` / `vg:member:read` |
| `Volunteer` | `/volunteers` | `vg:volunteer` / `vg:volunteer:read` |
| `ServiceRequest` | `/service-requests` | `vg:service-request` / `vg:service-request:read` |

### CRUD Operations

Each resource supports the full CRUD set. operationIds follow the `<httpVerb><Resource>[Qualifier]` pattern.

#### Person

| Method | Path | operationId | Request Body | Response |
|---|---|---|---|---|
| GET | `/persons` | `getPersons` | — | 200 `[Person]` |
| POST | `/persons` | `createPerson` | `PersonPost` | 201 `Person` |
| GET | `/persons/{personId}` | `getPerson` | — | 200 `Person` |
| PATCH | `/persons/{personId}` | `patchPerson` | `PersonPatch` | 200 `Person` |
| DELETE | `/persons/{personId}` | `deletePerson` | — | 200 `Person` |
| PUT | `/persons/{personId}/villages` | `putPersonVillages` | `[VillageId]` | 200 `Person` |

The `villages` sub-resource manages which villages a person belongs to. PUT replaces the entire set.

#### Member

| Method | Path | operationId | Request Body | Response |
|---|---|---|---|---|
| GET | `/members` | `getMembers` | — | 200 `[Member]` |
| POST | `/members` | `createMember` | `MemberPost` | 201 `Member` |
| GET | `/members/{memberId}` | `getMember` | — | 200 `Member` |
| PATCH | `/members/{memberId}` | `patchMember` | `MemberPatch` | 200 `Member` |
| DELETE | `/members/{memberId}` | `deleteMember` | — | 200 `Member` |

#### Volunteer

| Method | Path | operationId | Request Body | Response |
|---|---|---|---|---|
| GET | `/volunteers` | `getVolunteers` | — | 200 `[Volunteer]` |
| POST | `/volunteers` | `createVolunteer` | `VolunteerPost` | 201 `Volunteer` |
| GET | `/volunteers/{volunteerId}` | `getVolunteer` | — | 200 `Volunteer` |
| PATCH | `/volunteers/{volunteerId}` | `patchVolunteer` | `VolunteerPatch` | 200 `Volunteer` |
| DELETE | `/volunteers/{volunteerId}` | `deleteVolunteer` | — | 200 `Volunteer` |
| PUT | `/volunteers/{volunteerId}/capabilities` | `putVolunteerCapabilities` | `[CapabilityId]` | 200 `Volunteer` |

The `capabilities` sub-resource manages which capabilities a volunteer claims. PUT replaces the entire set.

#### ServiceRequest

| Method | Path | operationId | Request Body | Response |
|---|---|---|---|---|
| GET | `/service-requests` | `getServiceRequests` | — | 200 `[ServiceRequest]` |
| POST | `/service-requests` | `createServiceRequest` | `ServiceRequestPost` | 201 `ServiceRequest` |
| GET | `/service-requests/{serviceRequestId}` | `getServiceRequest` | — | 200 `ServiceRequest` |
| PATCH | `/service-requests/{serviceRequestId}` | `patchServiceRequest` | `ServiceRequestPatch` | 200 `ServiceRequest` |
| DELETE | `/service-requests/{serviceRequestId}` | `deleteServiceRequest` | — | 200 `ServiceRequest` |

---

## Schemas

### IDs and Basic Types

New schema type aliases (all inherit from `StringIntId`):
- `PersonId`
- `MemberId`
- `VolunteerId`
- `ServiceRequestId`
- `CapabilityId`

`VillageId` already exists in the existing spec.

### Person

**`Person`** (read response)
```
personId: PersonId (required)
fullName: string, maxLength 200 (required)
lastName: string, maxLength 100 (optional, nullable)
firstName: string, maxLength 100 (optional, nullable)
nickname: string, maxLength 100 (optional, nullable)
address: string, maxLength 300 (optional, nullable)
city: string, maxLength 100 (optional, nullable)
state: string, maxLength 50 (optional, nullable)
zip: string, maxLength 20 (optional, nullable)
email: string, maxLength 200 (optional, nullable)
phone: string, maxLength 50 (optional, nullable)
cell: string, maxLength 50 (optional, nullable)
birthDate: date (optional, nullable)
joinDate: date (optional, nullable)
villageIds: [VillageId] (optional, may be empty)
```

**`PersonPost`** (create request; fullName required, all others optional)

**`PersonPatch`** (update request; minProperties: 1)

### Member

**`Member`** (read response)
```
memberId: MemberId (required)
personId: PersonId (required)
memberNumber: string, maxLength 50 (optional, nullable)
memberLevel: string, maxLength 100 (optional, nullable)
serviceNotes: string (optional, nullable)
emergencyContactName: string, maxLength 200 (optional, nullable)
emergencyContactRelationship: string, maxLength 100 (optional, nullable)
emergencyContactPhone: string, maxLength 50 (optional, nullable)
emergencyContactEmail: string, maxLength 200 (optional, nullable)
```

**`MemberPost`** (create request; personId required, all others optional)

**`MemberPatch`** (update request; minProperties: 1)

### Volunteer

**`Volunteer`** (read response)
```
volunteerId: VolunteerId (required)
personId: PersonId (required)
emergencyPhone: string, maxLength 50 (optional, nullable)
capabilityIds: [CapabilityId] (optional, may be empty)
```

**`VolunteerPost`** (create request; personId required, all others optional)

**`VolunteerPatch`** (update request; minProperties: 1; does not allow updating personId)

### ServiceRequest

**`ServiceRequest`** (read response)
```
serviceRequestId: ServiceRequestId (required)
requestNumber: integer (optional, nullable)
villageId: VillageId (required)
memberPersonId: PersonId (optional, nullable)
volunteerPersonId: PersonId (optional, nullable)
status: string, maxLength 50 (optional, nullable)
serviceName: string, maxLength 200 (optional, nullable)
transportationType: string, maxLength 100 (optional, nullable)
createdAt: date-time (optional, nullable)
startAt: date-time (optional, nullable)
finishAt: date-time (optional, nullable)
instructions: string (optional, nullable)
description: string (optional, nullable)
destination: string (optional, nullable)
address: string (optional, nullable)
city: string, maxLength 100 (optional, nullable)
phone: string, maxLength 50 (optional, nullable)
```

**`ServiceRequestPost`** (create request; villageId required, all others optional)

**`ServiceRequestPatch`** (update request; minProperties: 1)

---

## Security

All endpoints use `oauth` (OpenID Connect) with scope checks:
- **Write operations** (POST, PATCH, DELETE, PUT sub-resources): require `vg:<resource>` scope
- **Read operations** (GET): require `vg:<resource>:read` scope

Example:
```yaml
security:
  - oauth:
    - vg:person:read  # for GET /persons
  - oauth:
    - vg:person      # for POST /persons
```

No `x-elevation-required` or `ElevateQuery` parameter on these endpoints — elevation is reserved for admin operations (Job/Operation management).

---

## Response Conventions

- **Success responses** (200, 201): Return the resource(s) as JSON
- **DELETE responses** (200): Return the deleted resource (matches `deleteUser` pattern)
- **Error responses** (default): Use `$ref: '#/components/schemas/Error'` with shape `{error, detail, stack}`
- **Collections** (list endpoints): Wrapped as `type: array, items: $ref`

---

## Implementation Readiness

This spec is complete and OAS 3.0.1 valid. The next phase will implement four controllers:

- `api/source/controllers/Person.js` → handlers for Person endpoints
- `api/source/controllers/Member.js` → handlers for Member endpoints
- `api/source/controllers/Volunteer.js` → handlers for Volunteer endpoints
- `api/source/controllers/ServiceRequest.js` → handlers for ServiceRequest endpoints

Each controller will be wired by `express-openapi-validator`'s resolver: `tags[0]` → filename, `operationId` → function name.
