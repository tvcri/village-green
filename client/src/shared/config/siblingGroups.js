/**
 * Sibling group definitions for breadcrumb navigation.
 * Groups define which routes are peers that can navigate to each other.
 * Also includes detail-to-list route mappings.
 */

export const siblingGroups = {
  'village-sections': [
    { name: 'members', label: 'Members' },
    { name: 'volunteers', label: 'Volunteers' },
    { name: 'service-requests', label: 'Service Requests' }
  ],
  'admin-sections': [
    { name: 'admin-village-access', label: 'Village Access' },
    { name: 'admin-user-access', label: 'Users' }
  ]
}

// Map detail routes to their parent list routes
export const detailToListMap = {
  'member-detail': 'members',
  'volunteer-detail': 'volunteers',
  'service-request-detail': 'service-requests'
}
