// CSV/Sheets row + column shape for the Users admin table. Kept pure and
// separate from UserList.vue so the Access flattening is unit-testable.
import { buildAccessTags } from '../../../shared/lib/accessTagHelpers.js'
import { formatLocalDateTime } from '../../../shared/lib/dateUtils.js'

export const columnsForCsv = [
  { header: 'Username', key: 'username' },
  { header: 'Display Name', key: 'displayName' },
  { header: 'Access', key: 'access' },
  { header: 'VSS', key: 'vss' },
  { header: 'Status', key: 'status' },
  { header: 'Last Access', key: 'lastAccess' },
]

// The Access column renders as tags; a flat file gets the same abbreviated
// text joined with '; '. Status is a real column here because the UI conveys
// it only by dimming the row, which no CSV can carry.
export function userRowsForCsv(users) {
  return (users ?? []).map(u => ({
    username: u.username ?? '',
    displayName: u.displayName === u.username ? '' : (u.displayName ?? ''),
    access: buildAccessTags(u).map(t => t.text).join('; '),
    vss: u.isVolunteer ? 'Yes' : 'No',
    status: u.status ?? '',
    lastAccess: u.lastAccess ? formatLocalDateTime(u.lastAccess * 1000) : '',
  }))
}
