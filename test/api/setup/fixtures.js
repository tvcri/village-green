// Canonical test data — Rhode Island + Lovecraft themed, all fake.
//
// IDs are explicit and fixed so seed.js and the test files share one source of
// truth (no fragile reliance on auto-increment order). The `role` keys (full_v1,
// multi, ...) are the stable handles tests reference, so test logic stays readable
// regardless of the themed display names / email usernames.

export const villages = {
  quahog: { id: 1, name: 'Quahog' },
  innsmouth: { id: 2, name: 'Innsmouth' },
  miskatonic: { id: 3, name: 'Miskatonic' },
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
}

// person rows. Each village has a member-person and a volunteer-person, with
// contact details populated so projection-based address leaks are observable.
function addr (street, city, zip) {
  return {
    address: street, city, state: 'RI', zip,
    email: `${street.split(' ')[0].toLowerCase()}@residents.test`,
    phone: '401-555-0101', cell: '401-555-0202',
  }
}

export const persons = {
  quahogMember: { id: 1, villageId: villages.quahog.id, fullName: 'Esek Hopkins', ...addr('1 Spooner St', 'Quahog', '02860') },
  quahogVolunteer: { id: 2, villageId: villages.quahog.id, fullName: 'Stephen Hopkins', ...addr('2 Pawtucket Ave', 'Quahog', '02860') },
  innsmouthMember: { id: 3, villageId: villages.innsmouth.id, fullName: 'Zadok Allen', ...addr('7 Water St', 'Innsmouth', '02882') },
  innsmouthVolunteer: { id: 4, villageId: villages.innsmouth.id, fullName: 'Obed Marsh', ...addr('8 Marsh Refinery Rd', 'Innsmouth', '02882') },
  miskatonicMember: { id: 5, villageId: villages.miskatonic.id, fullName: 'Herbert West', ...addr('9 Crane St', 'Arkham', '02893') },
  miskatonicVolunteer: { id: 6, villageId: villages.miskatonic.id, fullName: 'Henry Armitage', ...addr('10 Library Way', 'Arkham', '02893') },
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
    status: 'Confirmed', serviceName: 'Ride to appointment', destination: 'Arkham Sanitarium',
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
    status: 'Open', serviceName: 'Grocery run', destination: 'Federal Hill',
    finishAt: '2026-07-12 11:00:00',
  },
}

// Scope strings for the token's `scope` claim (space-delimited; the API does
// hierarchical prefix matching, so `vg:service-request` covers `:read` + write).
export const scopes = {
  full: 'vg:service-request vg:village vg:person',
  readOnly: 'vg:service-request:read vg:village:read vg:person:read',
  noServiceRequest: 'vg:village:read vg:person:read',
}
