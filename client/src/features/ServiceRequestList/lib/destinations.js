// Helpers for a service request's list of destinations:
// [{ destination, address, city, state, zip, phone }], in entry order, no ids.

const FIELDS = ['destination', 'address', 'city', 'state', 'zip', 'phone']

export const stateOptions = ['RI', 'CT', 'MA']

export function emptyDestination() {
  return { destination: '', address: '', city: '', state: '', zip: '', phone: '' }
}

export function isBlankDestination(d) {
  return FIELDS.every((f) => !String(d?.[f] ?? '').trim())
}

// A lone fully blank block means "no destination" and is dropped. Blank extras
// are kept (as all-null) so validation can flag them.
export function destinationsForSave(blocks) {
  const list = blocks ?? []
  if (list.length === 1 && isBlankDestination(list[0])) return []
  return list.map((b) => {
    const out = {}
    for (const f of FIELDS) out[f] = String(b?.[f] ?? '').trim() || null
    return out
  })
}

export function summarize(destinations, field) {
  const list = destinations ?? []
  if (!list.length) return ''
  const first = list[0]?.[field] || null
  if (list.length === 1) return first ?? ''
  return `${first ?? '—'} +${list.length - 1}`
}

export function joinField(destinations, field) {
  return (destinations ?? []).map((d) => d?.[field] ?? '').join('; ')
}

// Flat columns for CSV/Sheets export.
export function withDestinationColumns(rows) {
  return rows.map((r) => ({
    ...r,
    destination: joinField(r.destinations, 'destination'),
    address: joinField(r.destinations, 'address'),
    city: joinField(r.destinations, 'city'),
    state: joinField(r.destinations, 'state')
  }))
}

// Geocodable text for the map; '' when there is neither address nor city.
export function placeQuery(d) {
  if (!d?.address && !d?.city) return ''
  return [d.address, d.city, d.state].filter(Boolean).join(', ')
}
