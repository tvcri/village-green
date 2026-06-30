// Canonical test data — Rhode Island themed (Family Guy's Quahog, with light
// Lovecraft place-name nods), all fake.
//
// IDs are explicit and fixed so seed.js and the test files share one source of
// truth (no fragile reliance on auto-increment order). The `role` keys (full_v1,
// multi, ...) are the stable handles tests reference, so test logic stays readable
// regardless of the themed display names / email usernames.

export const villages = {
  quahog: { id: 1, name: 'Quahog' },
  innsmouth: { id: 2, name: 'Innsmouth' },
  miskatonic: { id: 3, name: 'Miskatonic' },
  // Disposable village for destructive write tests (grant CRUD, etc.). Nothing
  // else references it — no persons / service requests / FCV, and no read test
  // asserts its contents — so tests may mutate it freely. Reseeded each run.
  scratch: { id: 4, name: 'Pawtuxet' },
}

// roleId: 1=restricted, 2=full, 3=manage, 4=owner
// privileges land in the token's realm_access.roles claim (e.g. 'admin').
export const users = {
  owner_v1: {
    userId: 1, name: 'Roger Williams', username: 'roger.williams@gmail.test',
    grants: [{ villageId: villages.quahog.id, roleId: 4 }], privileges: [],
  },
  full_v1: {
    userId: 2, name: 'Anne Hutchinson', username: 'anne.hutchinson@quahog.test',
    grants: [{ villageId: villages.quahog.id, roleId: 2 }], privileges: [],
  },
  restricted_v1: {
    userId: 3, name: 'Gilbert Stuart', username: 'gilbert.stuart@gmail.test',
    grants: [{ villageId: villages.quahog.id, roleId: 1 }], privileges: [],
  },
  full_v2: {
    userId: 4, name: 'H.P. Lovecraft', username: 'hp.lovecraft@miskatonic.test',
    grants: [{ villageId: villages.innsmouth.id, roleId: 2 }], privileges: [],
  },
  full_v3: {
    userId: 5, name: 'Nathanael Greene', username: 'n.greene@ri.test',
    grants: [{ villageId: villages.miskatonic.id, roleId: 2 }], privileges: [],
  },
  // Legitimately spans Quahog + Innsmouth; deliberately NOT granted Miskatonic
  // (the exclusion target for meta roll-up assertions).
  multi: {
    userId: 6, name: 'John Brown', username: 'john.brown@brownbros.test',
    grants: [
      { villageId: villages.quahog.id, roleId: 2 },
      { villageId: villages.innsmouth.id, roleId: 2 },
    ],
    privileges: [],
  },
  admin: {
    userId: 7, name: 'Moses Brown', username: 'moses.brown@brownbros.test',
    grants: [], privileges: ['admin'],
  },
  // Authenticated with valid scope but zero grants — must see nothing.
  nogrants: {
    userId: 8, name: 'Mr. Calimari', username: 'mr.calimari@quahog.test',
    grants: [], privileges: [],
  },
  // Disposable grant target for write tests — seeded with NO grants, asserted
  // nowhere, so its access (or the scratch village's grants) can be mutated freely.
  scratch: {
    userId: 9, name: 'Scratch Tester', username: 'scratch.tester@scratch.test',
    grants: [], privileges: [],
  },
}

// person rows. Each village has a member-person and a volunteer-person, with
// contact details populated so projection-based address leaks are observable.
// `address` is a generated column (concat of street + unit), so we seed `street`.
function person (id, villageId, fullName, street, city, zip) {
  const parts = fullName.toLowerCase().replace(/[^a-z ]/g, '').split(/\s+/).filter(Boolean)
  return {
    id, villageId, fullName,
    street, city, state: 'RI', zip,
    email: `${parts[0]}.${parts[parts.length - 1]}@residents.test`,
    phone: '401-555-0101', cell: '401-555-0202',
  }
}

export const persons = {
  // Quahog: Family Guy (31 Spooner Street is the Griffins' address)
  quahogMember: person(1, villages.quahog.id, 'Peter Griffin', '31 Spooner St', 'Quahog', '02860'),
  quahogVolunteer: person(2, villages.quahog.id, 'Joe Swanson', '33 Spooner St', 'Quahog', '02860'),
  // Innsmouth / Miskatonic: low-key fake residents (the village names are the only nod)
  innsmouthMember: person(3, villages.innsmouth.id, 'Edith Sargent', '7 Water St', 'Innsmouth', '02882'),
  innsmouthVolunteer: person(4, villages.innsmouth.id, 'Caleb Easton', '12 Harbor Rd', 'Innsmouth', '02882'),
  miskatonicMember: person(5, villages.miskatonic.id, 'Eleanor Vance', '9 College St', 'Arkham', '02893'),
  miskatonicVolunteer: person(6, villages.miskatonic.id, 'Walter Brattle', '10 Library Way', 'Arkham', '02893'),
}

export const members = {
  quahog: { id: 1, personId: persons.quahogMember.id, memberNumber: 'Q-1001' },
  innsmouth: { id: 2, personId: persons.innsmouthMember.id, memberNumber: 'I-2001' },
  miskatonic: { id: 3, personId: persons.miskatonicMember.id, memberNumber: 'M-3001' },
}

export const volunteers = {
  quahog: { id: 1, personId: persons.quahogVolunteer.id },
  innsmouth: { id: 2, personId: persons.innsmouthVolunteer.id },
  miskatonic: { id: 3, personId: persons.miskatonicVolunteer.id },
}

export const serviceRequests = {
  srV1: {
    id: 1, villageId: villages.quahog.id, requestNumber: 101,
    memberPersonId: persons.quahogMember.id, volunteerPersonId: persons.quahogVolunteer.id,
    status: 'Confirmed', serviceName: 'Ride to pharmacy', destination: "Goldman's Pharmacy",
    finishAt: '2026-07-10 09:00:00',
  },
  srV2: {
    id: 2, villageId: villages.innsmouth.id, requestNumber: 201,
    memberPersonId: persons.innsmouthMember.id, volunteerPersonId: persons.innsmouthVolunteer.id,
    status: 'Confirmed', serviceName: 'Ride to campus', destination: 'Miskatonic University',
    finishAt: '2026-07-11 10:00:00',
  },
  srV3: {
    id: 3, villageId: villages.miskatonic.id, requestNumber: 301,
    memberPersonId: persons.miskatonicMember.id, volunteerPersonId: null,
    status: 'Open', serviceName: 'Ride to hospital', destination: 'Arkham Hospital',
    finishAt: '2026-07-12 11:00:00',
  },
}

// FCV (Friendly Caller/Visitor) submissions — the data behind GET /friends.
// One per village so grant-filtering and the query filters are observable.
// volunteer/member personIds reference the seeded persons above.
export const fcvSubmissions = {
  fcvV1: {
    id: 1, villageId: villages.quahog.id,
    volunteerPersonId: persons.quahogVolunteer.id, memberPersonId: persons.quahogMember.id,
    visitDate: '2026-06-01', timeSpentMinutes: 60, contactType: 'In-person',
    activityTypes: ['Ride', 'Friendly visit'], notes: 'Quahog check-in', submittedAt: '2026-06-01 13:00:00',
  },
  fcvV2: {
    id: 2, villageId: villages.innsmouth.id,
    volunteerPersonId: persons.innsmouthVolunteer.id, memberPersonId: persons.innsmouthMember.id,
    visitDate: '2026-06-02', timeSpentMinutes: 30, contactType: 'Phone',
    activityTypes: ['Phone call'], notes: 'Innsmouth call', submittedAt: '2026-06-02 14:00:00',
  },
  fcvV3: {
    id: 3, villageId: villages.miskatonic.id,
    volunteerPersonId: persons.miskatonicVolunteer.id, memberPersonId: persons.miskatonicMember.id,
    visitDate: '2026-06-03', timeSpentMinutes: 45, contactType: 'In-person',
    activityTypes: ['Friendly visit'], notes: 'Miskatonic visit', submittedAt: '2026-06-03 15:00:00',
  },
}

// Scope strings for the token's `scope` claim (space-delimited; the API does
// hierarchical prefix matching, so `vg:service-request` covers `:read` + write).
// `full` is the all-resources scope so canonical users can reach every endpoint
// in the suite (the broad `vg:<resource>` form covers `:read` + write; friends
// only defines a `:read` scope). Narrow variants below intentionally omit scopes
// to exercise per-resource scope enforcement.
export const scopes = {
  full: 'vg:service-request vg:village vg:person vg:member vg:volunteer vg:friends:read vg:user vg:op vg:read',
  readOnly: 'vg:service-request:read vg:village:read vg:person:read',
  noServiceRequest: 'vg:village:read vg:person:read',
}
