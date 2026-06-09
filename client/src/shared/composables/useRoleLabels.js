const roleLabels = {
  1: 'Restricted',
  2: 'Full',
  3: 'Manage',
  4: 'Owner'
}

export function useRoleLabels() {
  const getRoleLabel = (roleId) => {
    return roleLabels[roleId] || `Role ${roleId}`
  }

  const getRoles = () => {
    return [
      { id: 1, label: 'Restricted' },
      { id: 2, label: 'Full' },
      { id: 3, label: 'Manage' },
      { id: 4, label: 'Owner' }
    ]
  }

  return {
    getRoleLabel,
    getRoles,
    roleLabels
  }
}
