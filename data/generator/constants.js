// capability ids are FIXED by the static migration seed — reference these exact ids.
export const CAPABILITIES = [
  { id: 1, name: 'Errands' }, { id: 2, name: 'Friends' }, { id: 3, name: 'Home Help' },
  { id: 4, name: 'Tech Support' }, { id: 5, name: 'Rides' }, { id: 6, name: 'Circles' },
  { id: 9, name: 'Governance' }, { id: 10, name: 'Healthcare Support' },
  { id: 12, name: 'New Member Intake' }, { id: 13, name: 'Office Services' },
  { id: 15, name: 'Safety Net' }, { id: 16, name: 'Service Referrals' },
  { id: 18, name: 'Village Affiliation' },
]

// role ids are FIXED by the static catalog (20-vg-static.sql) — reference, never insert.
export const ROLE = { lsc: 1, steering: 2, lead: 3, admin: 4, staff: 5, board: 6, serviceCoordinator: 7 }
export const ROLE_NAMES = {
  1: 'Local Service Coordinator', 2: 'Steering Committee', 3: 'Village Lead',
  4: 'Admin', 5: 'Staff', 6: 'Board', 7: 'Service Coordinator',
}

// service_request.serviceName values are UI-enforced (serviceNameOptions in
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

// 10 villages. Per-village headcount = CLASS_TOTALS[size] split by mix:
// most villages are volunteer-heavy (~40/60 members:volunteers — the real-world
// norm); mix:'memberHeavy' flips to ~60/40 (spec §5).
export const VILLAGES = [
  { name: 'Arkham', size: 'big', theme: 'lovecraft-health' },
  { name: 'Quahog', size: 'big', theme: 'family-guy', mix: 'memberHeavy' },
  { name: 'New York System', size: 'medium', theme: 'providence' },
  { name: 'Oldport', size: 'medium', theme: 'gilded-age', mix: 'memberHeavy' },
  { name: 'Innsmouth', size: 'small', theme: 'lovecraft' },
  { name: 'Kingsport', size: 'small', theme: 'lovecraft', mix: 'memberHeavy' },
  { name: 'Dunwich', size: 'small', theme: 'lovecraft' },
  { name: 'Chipwhich', size: 'small', theme: 'chepachet' },
  { name: 'Pawstuxnet', size: 'small', theme: 'gaspee' },
  { name: 'Cabinet', size: 'tiny', theme: 'made-up' },
]

export const CLASS_TOTALS = { big: 113, medium: 20, small: 9, tiny: 5 }

// Parent-before-child insert order (FK checks are disabled during load, but stay tidy).
export const TABLE_ORDER = [
  'village', 'user_data', 'role_grant',
  'privacy_rules', 'privacy_acknowledgement',
  'capability', 'disability', 'vetting_type', 'community',
  'person', 'member', 'volunteer',
  'volunteer_capability', 'volunteer_vetting', 'person_disability', 'person_community',
  'service_request', 'notification_event', 'fcv_submission',
]
