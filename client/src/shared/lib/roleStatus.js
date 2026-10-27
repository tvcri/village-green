// Tag for a member's or volunteer's status. A deceased person's tag says
// Deceased, whatever the stored status.
const SEVERITY = { Active: 'success', Pending: 'secondary', Dropped: 'warn' }

export function roleStatusTag (status, deceased) {
  if (deceased) return { value: 'Deceased', severity: 'contrast' }
  return status ? { value: status, severity: SEVERITY[status] ?? 'secondary' } : null
}
