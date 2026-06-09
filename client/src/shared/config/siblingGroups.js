/**
 * Sibling group definitions for breadcrumb navigation.
 * Groups define which routes are peers that can navigate to each other.
 */

export const siblingGroups = {
  'village-sections': ['members', 'volunteers', 'service-requests'],
  'admin-sections': ['admin-village-access', 'admin-user-access']
}

export const siblingLabels = {
  'members': 'Members',
  'volunteers': 'Volunteers',
  'service-requests': 'Service Requests',
  'admin-village-access': 'Village Access',
  'admin-user-access': 'User Access'
}
