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

// service_request.service_name values are UI-enforced (serviceNameOptions in
// ServiceRequestCreateEdit.vue) — keep this list in sync with the client.
export const SERVICE_CATEGORIES = [
  'Ride: Medical Appnt', 'Ride: Shopping', 'Ride: Activity/Event', 'Ride: Personal Care',
  'Ride: Other', 'Tech Support', 'Household Chores/Handy Help',
  'Errand: Shopping', 'Errand: Pick up/delivery', 'Errand: Other',
]
// The UI hides destination/address/city/phone for these (noLocationServices).
export const NO_LOCATION_SERVICES = ['Tech Support', 'Household Chores/Handy Help']
// Rides must be Round Trip or One Way; everything else is 'None' (UI watcher).
export const TRANSPORT_RIDE_W = [['Round Trip', 4], ['One Way', 1]]

export const RI_STREETS = ['Benefit St', 'Thayer St', 'Hope St', 'Wickenden St', 'Atwells Ave',
  'Westminster St', 'Spooner St', 'Water St', 'Bellevue Ave', 'Ocean Dr', 'Federal Hill',
  'Angell St', 'Power St', 'College St', 'Elmgrove Ave', 'Broadway', 'Smith St']

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
  'privacy_rules', 'privacy_acknowledgement',
  'capability', 'disability', 'vetting_type',
  'person', 'member', 'volunteer',
  'volunteer_capability', 'volunteer_vetting', 'person_disability',
  'service_request', 'notification_event', 'fcv_submission',
]
