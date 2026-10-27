// Tag for a member's or volunteer's status. A deceased person's tag says
// Deceased, whatever the stored status.
const SEVERITY = { Active: 'success', Pending: 'secondary', Dropped: 'warn' }

export function roleStatusTag (status, deceased) {
  if (deceased) return { value: 'Deceased', severity: 'contrast' }
  return status ? { value: status, severity: SEVERITY[status] ?? 'secondary' } : null
}

// A person who is both member and volunteer has two status payloads whose
// field names collide (status, dropReasonId, dropReasonName,
// statusChangeNotes). Flatten the role payloads for PersonDetailCard so the
// member keeps the plain names and the volunteer's four arrive as
// volunteerStatus, volunteerDropReasonId, volunteerDropReasonName and
// volunteerStatusChangeNotes. Pass null for a role that should not show.
const STATUS_KEYS = ['status', 'dropReasonId', 'dropReasonName', 'statusChangeNotes']

export function flattenRoles (rest, member, volunteer) {
  const out = { ...rest, ...member }
  if (volunteer) {
    for (const [k, v] of Object.entries(volunteer)) {
      if (STATUS_KEYS.includes(k)) out[`volunteer${k[0].toUpperCase()}${k.slice(1)}`] = v
      else out[k] = v
    }
  }
  return out
}
