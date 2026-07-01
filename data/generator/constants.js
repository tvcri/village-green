// capability ids are FIXED by the static migration seed — reference these exact ids.
export const CAPABILITIES = [
  { id: 1, name: 'Errands' }, { id: 2, name: 'Friends' }, { id: 3, name: 'Home Help' },
  { id: 4, name: 'Tech Support' }, { id: 5, name: 'Rides' }, { id: 6, name: 'Circles' },
  { id: 9, name: 'Governance' }, { id: 10, name: 'Healthcare Support' },
  { id: 12, name: 'New Member Intake' }, { id: 13, name: 'Office Services' },
  { id: 15, name: 'Safety Net' }, { id: 16, name: 'Service Referrals' },
  { id: 18, name: 'Village Affiliation' },
]

export const ROLE = { restricted: 1, full: 2, manage: 3, owner: 4 }

// 10 villages; the two 'big' ones must reach 50+ members AND 50+ volunteers.
export const VILLAGES = [
  { name: 'Arkham', size: 'big', theme: 'lovecraft-health' },
  { name: 'Quahog', size: 'big', theme: 'family-guy' },
  { name: 'New York System', size: 'medium', theme: 'providence' },
  { name: 'Oldport', size: 'medium', theme: 'gilded-age' },
  { name: 'Innsmouth', size: 'small', theme: 'lovecraft' },
  { name: 'Kingsport', size: 'small', theme: 'lovecraft' },
  { name: 'Dunwich', size: 'small', theme: 'lovecraft' },
  { name: 'Chipwhich', size: 'small', theme: 'chepachet' },
  { name: 'Pawstuxnet', size: 'small', theme: 'gaspee' },
  { name: 'Cabinet', size: 'tiny', theme: 'made-up' },
]

// Parent-before-child insert order (FK checks are disabled during load, but stay tidy).
export const TABLE_ORDER = [
  'village', 'user_data', 'village_grant',
  'capability', 'disability', 'vetting_type',
  'person', 'member', 'volunteer',
  'volunteer_capability', 'volunteer_vetting', 'person_disability',
  'service_request', 'notification_event', 'fcv_submission',
]
