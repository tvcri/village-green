// The standard person block for a download whose rows each name a person
// (training completions, position holders). Mirrors PersonList.vue's export:
// projection=detail is fetched only when the user downloads, and email,
// phone and cell come from the summary row root, since `detail` omits them.
import { getPersons } from '../api/personApi.js'
import { personExportValues } from '../../../shared/lib/personExport.js'

function parsePhoneObj (val) {
  if (val && typeof val === 'object') return val
  if (typeof val === 'string') {
    try { return JSON.parse(val) } catch { return {} }
  }
  return {}
}

// rows: the page's own export rows, in order. Each comes back with the person
// block merged in. A person on several rows gets the same block on each; a
// person the fetch did not return keeps the row with the block blank.
export async function withPersonDetail (rows, getPersonId) {
  const persons = await getPersons({ projection: ['detail'] })
  const byId = new Map(persons.map(p => [p.personId, p]))
  return rows.map(row => {
    const p = byId.get(getPersonId(row))
    if (!p) return row
    const { phone, cell } = parsePhoneObj(p.phone)
    return { ...row, ...personExportValues({ ...(p.detail ?? {}), email: p.email, phone, cell }) }
  })
}

// "LSC Training" -> "lsc-training", for download file names.
export const exportSlug = (name) => String(name ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
