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

// roleId (post-#56 capability roles, seeded by migration 0013):
//   village scope: 1=Local Service Coordinator, 2=Steering Committee, 3=Village Lead
//   federation scope (villageId null): 4=Admin, 5=Staff, 6=Board, 7=Service Coordinator
// Old fixture roles map per the migration's LEAST(roleId, 3): restricted→1,
// full→2, owner→3. Admin is now a DB grant (roleId 4), not a token privilege —
// holdsAnyElevatable() reads effective permissions computed from role_grant.
// privileges still land in the token's realm_access.roles claim.
export const users = {
  owner_v1: {
    userId: 1, name: 'Roger Williams', username: 'roger.williams@gmail.test',
    grants: [{ villageId: villages.quahog.id, roleId: 3 }], privileges: [],
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
    grants: [{ villageId: null, roleId: 4 }], privileges: ['admin'],
  },
  // Federation-scope operators (villageId null). Post-#56, all writes live at
  // federation scope: staff holds every resource :write, sc only sr:write,
  // board is read-everything. Named for famous Rhode Islanders.
  staff: {
    userId: 10, name: 'Sarah Helen Whitman', username: 'sarah.whitman@federation.test',
    grants: [{ villageId: null, roleId: 5 }], privileges: [],
  },
  board: {
    userId: 11, name: 'Ambrose Burnside', username: 'a.burnside@federation.test',
    grants: [{ villageId: null, roleId: 6 }], privileges: [],
  },
  sc: {
    userId: 12, name: 'Ida Lewis', username: 'ida.lewis@federation.test',
    grants: [{ villageId: null, roleId: 7 }], privileges: [],
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
  // VSS persona. Every OTHER fixture username is @quahog.test / @federation.test
  // / etc. and deliberately matches no person email (@residents.test), so all of
  // them resolve to personIds = [] and the whole /volunteer-requests surface is
  // 403 for them. This one matches persons.quahogVolunteer AND
  // persons.vssHouseholdSibling by email — which is the ONLY way in (VSS access
  // is identity-derived, not grant-derived). Zero grants on purpose: it proves
  // the staff gate exempts /volunteer-requests. seed.js asserts this username
  // still matches those person rows, so renaming either side fails loudly.
  vssJoe: {
    userId: 13, name: 'Joe Swanson', username: 'joe.swanson@residents.test',
    grants: [], privileges: [],
  },
}

// person rows. Each village has a member-person and a volunteer-person, with
// contact details populated so projection-based address leaks are observable.
// `address` (street + unit) and `fullName` ("lastName, firstName") are generated
// columns, so we seed street/firstName/lastName and precompute `fullName` here in
// the DB's format so tests can assert against API responses.
function person (id, villageId, firstName, lastName, street, city, zip) {
  return {
    id, villageId, firstName, lastName,
    fullName: `${lastName}, ${firstName}`,
    street, city, state: 'RI', zip,
    email: `${firstName.toLowerCase().replace(/[^a-z]/g, '')}.${lastName.toLowerCase().replace(/[^a-z]/g, '')}@residents.test`,
    phone: '401-555-0101', cell: '401-555-0202',
  }
}

export const persons = {
  // Quahog: Family Guy (31 Spooner Street is the Griffins' address)
  quahogMember: person(1, villages.quahog.id, 'Peter', 'Griffin', '31 Spooner St', 'Quahog', '02860'),
  quahogVolunteer: person(2, villages.quahog.id, 'Joe', 'Swanson', '33 Spooner St', 'Quahog', '02860'),
  // Innsmouth / Miskatonic: low-key fake residents (the village names are the only nod)
  innsmouthMember: person(3, villages.innsmouth.id, 'Edith', 'Sargent', '7 Water St', 'Innsmouth', '02882'),
  innsmouthVolunteer: person(4, villages.innsmouth.id, 'Caleb', 'Easton', '12 Harbor Rd', 'Innsmouth', '02882'),
  miskatonicMember: person(5, villages.miskatonic.id, 'Eleanor', 'Vance', '9 College St', 'Arkham', '02893'),
  miskatonicVolunteer: person(6, villages.miskatonic.id, 'Walter', 'Brattle', '10 Library Way', 'Arkham', '02893'),
  // VSS household: a SECOND person row sharing quahogVolunteer's email
  // (person() derives it from the name, so the duplicate is automatic — there is
  // an INDEX on person.email, not a unique constraint). sqlResolvedPersonIds
  // matches user_data.username against person.email, so the `vssJoe` user
  // resolves to BOTH active volunteers and exercises the #68 multi-volunteer
  // household outcomes (selectionRequired / alreadyOwnAccount / account-wide
  // release). Different village on purpose: VSS is village-independent.
  vssHouseholdSibling: person(7, villages.innsmouth.id, 'Joe', 'Swanson', '5 Marsh St', 'Innsmouth', '02882'),
}

// status 'Active' / active 1 so the active_member / active_volunteer views
// (which the services select from) include the canonical rows.
export const members = {
  quahog: { id: 1, personId: persons.quahogMember.id, memberNumber: 'Q-1001', status: 'Active' },
  innsmouth: { id: 2, personId: persons.innsmouthMember.id, memberNumber: 'I-2001', status: 'Active' },
  miskatonic: { id: 3, personId: persons.miskatonicMember.id, memberNumber: 'M-3001', status: 'Active' },
}

export const volunteers = {
  quahog: { id: 1, personId: persons.quahogVolunteer.id, active: 1 },
  innsmouth: { id: 2, personId: persons.innsmouthVolunteer.id, active: 1 },
  miskatonic: { id: 3, personId: persons.miskatonicVolunteer.id, active: 1 },
  vssSibling: { id: 4, personId: persons.vssHouseholdSibling.id, active: 1 },
}

// capabilityId values come from the scaffold's static catalog
// (sql/current/20-vg-static.sql): 1 Errands, 2 Friends, 3 Home Help, 4 Tech
// Support, 5 Rides, 11 Steering Committee.
//
// VolunteerRequestService maps capability -> serviceName PREFIX ('Rides' ->
// 'Ride:', 'Errands' -> 'Errand:'), so scope=open only surfaces requests whose
// serviceName starts with a held capability's prefix. Both household volunteers
// hold Rides; NEITHER holds Errands — that asymmetry is what makes the
// capability boundary observable (an 'Errand: ...' request must stay invisible).
// The canonical volunteers get Rides too so their own rows behave normally.
export const volunteerCapabilities = [
  { volunteerId: volunteers.quahog.id, capabilityId: 5 },
  { volunteerId: volunteers.innsmouth.id, capabilityId: 5 },
  { volunteerId: volunteers.miskatonic.id, capabilityId: 5 },
  { volunteerId: volunteers.vssSibling.id, capabilityId: 5 },
]

export const serviceRequests = {
  srV1: {
    id: 1, villageId: villages.quahog.id, requestNumber: 101,
    memberPersonId: persons.quahogMember.id, volunteerPersonId: persons.quahogVolunteer.id,
    status: 'Confirmed', serviceName: 'Ride to pharmacy', destination: "Goldman's Pharmacy",
    serviceDate: '2026-07-10', finishTime: '09:00:00',
  },
  srV2: {
    id: 2, villageId: villages.innsmouth.id, requestNumber: 201,
    memberPersonId: persons.innsmouthMember.id, volunteerPersonId: persons.innsmouthVolunteer.id,
    status: 'Confirmed', serviceName: 'Ride to campus', destination: 'Miskatonic University',
    serviceDate: '2026-07-11', finishTime: '10:00:00',
  },
  srV3: {
    id: 3, villageId: villages.miskatonic.id, requestNumber: 301,
    memberPersonId: persons.miskatonicMember.id, volunteerPersonId: null,
    status: 'Open', serviceName: 'Ride to hospital', destination: 'Arkham Hospital',
    serviceDate: '2026-07-12', finishTime: '11:00:00',
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
