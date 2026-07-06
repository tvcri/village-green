// Maps the POST /applications/extract response onto the person/member form shapes.

const s = v => v ?? ''

export function mapPersonForm (extraction, memberIndex) {
  const m = extraction.members[memberIndex]
  const p1 = memberIndex > 0 ? extraction.members[0] : {}
  const ec = extraction.emergencyContact
  return {
    firstName: s(m.firstName), middleInitial: s(m.middleInitial),
    lastName: s(m.lastName), nickname: s(m.nickname),
    street: s(m.street ?? p1.street), unit: s(m.unit ?? p1.unit),
    city: s(m.city ?? p1.city), state: s(m.state ?? p1.state), zip: s(m.zip ?? p1.zip),
    email: s(m.email),
    phone: s(m.phone ?? p1.phone), cell: s(m.cell),
    birthDate: s(m.birthDate),
    emergencyContactName: ec ? [ec.firstName, ec.middleInitial, ec.lastName].filter(Boolean).join(' ') : '',
    emergencyContactRelationship: s(ec?.relationship),
    emergencyContactPhone: s(ec?.phoneCell ?? ec?.phoneHome),
    emergencyContactEmail: s(ec?.email),
    villageId: extraction.application.village.villageId,
  }
}

export function personCommunityNames (extraction, memberIndex) {
  const names = new Set()
  if (extraction.members[memberIndex].extras.veteran === 'Yes') names.add('Veteran')
  if (extraction.preferences.circleOfPrideJoin === 'Yes') names.add('Pride')
  return names
}

const DISABILITY_NAMES_BY_FIELD = {
  difficultyHearing: 'Hearing',
  visionLimited: 'Vision',
  usesWalker: 'Walker',
  usesCane: 'Cane',
  usesWheelchair: 'Wheelchair',
}

// The prompt tells the model to fold a Yes/Sometimes-checkbox-conflict's
// explain text into accessibilityNotes and never flag it as uncertain — but
// in practice the model sometimes reports it as an uncertainFields entry on
// the accessibility.<field> path instead, with the explain text embedded in
// `reason` (quoted) and the checkbox's real value in `alternative`. Recover
// the note from that path so it isn't silently dropped.
function noteFromReason (reason) {
  const quoted = reason.match(/'([^']+)'/)
  return quoted ? quoted[1] : reason
}

export function personDisabilities (extraction, memberIndex) {
  const result = new Map()
  const accessibility = extraction.members[memberIndex].extras.accessibility
  if (!accessibility) return result
  const uncertainByField = new Map(
    (extraction.uncertainFields ?? [])
      .map(u => [u.path, u])
      .filter(([path]) => path.startsWith(`members[${memberIndex}].accessibility.`)),
  )
  for (const [field, name] of Object.entries(DISABILITY_NAMES_BY_FIELD)) {
    const conflict = uncertainByField.get(`members[${memberIndex}].accessibility.${field}`)
    const answer = conflict?.alternative ?? accessibility[field]
    if (answer !== 'Yes' && answer !== 'Sometimes') continue
    result.set(name, conflict ? noteFromReason(conflict.reason) : null)
  }
  return result
}

export function mapMemberForm (extraction, memberIndex, primaryPersonId) {
  const d = extraction.memberDefaults
  return {
    // joinDate is when the member record is created, not the application
    // date — leave it for the operator to set, same as a non-import grant.
    printedNewsletter: !!d.printedNewsletter,
    householdSize: extraction.application.householdType === 'Dual' ? 2 : 1,
    householdDues: d.duesYearly ?? d.duesMonthly ?? null,
    primaryPersonId: memberIndex > 0 ? primaryPersonId : '',
    miscNotes: composeNotes(extraction, memberIndex),
  }
}

export function composeNotes (extraction, memberIndex) {
  const { extras } = extraction.members[memberIndex]
  const { preferences: prefs, memberDefaults: d, application: app } = extraction
  const lines = ['Imported from application PDF']
  const push = (label, value) => { if (value !== null && value !== undefined && value !== '') lines.push(`${label}: ${value}`) }
  push('Application date', app.applicationDate)
  push('Ambassador', app.ambassador)
  push('Pronouns', extras.pronouns)
  push('Gender', extras.gender)
  push('Accessibility notes', extras.accessibilityNotes)
  // Cell was preferred for the emergencyContactPhone form field; keep the home
  // number on record when both were extracted.
  const ec = extraction.emergencyContact
  if (ec?.phoneCell && ec?.phoneHome) push('Emergency contact home phone', ec.phoneHome)
  push('Wants volunteer info', prefs.wantsVolunteerInfo)
  push('Circle of Pride preferred', prefs.circleOfPridePreferred)
  push('Payment method', d.paymentMethod)
  push('Dues (monthly)', d.duesMonthly)
  push('Dues (yearly)', d.duesYearly)
  push('Invoice mailed', d.invoiceMailed)
  return lines.join('\n')
}

// extraction path → person-form field, per member index
function personFieldForPath (path, memberIndex) {
  const memberMatch = path.match(/^members\[(\d+)\]\.(\w+)$/)
  if (memberMatch) {
    if (Number(memberMatch[1]) !== memberIndex) return null
    const field = memberMatch[2]
    // extras (pronouns/gender/veteran/accessibility.*) have no form field
    // Keep in sync with the keys returned by mapPersonForm / the PersonFormFields
    // form shape — a person field missing here silently loses its uncertainty flag.
    const personFields = ['firstName', 'middleInitial', 'lastName', 'nickname', 'street', 'unit',
      'city', 'state', 'zip', 'email', 'phone', 'cell', 'birthDate']
    return personFields.includes(field) ? field : null
  }
  if (path === 'application.villageName') return 'villageId'
  const ecMatch = path.match(/^emergencyContact\.(\w+)$/)
  if (ecMatch) {
    const map = {
      firstName: 'emergencyContactName', middleInitial: 'emergencyContactName', lastName: 'emergencyContactName',
      phoneHome: 'emergencyContactPhone', phoneCell: 'emergencyContactPhone',
      email: 'emergencyContactEmail', relationship: 'emergencyContactRelationship',
    }
    return map[ecMatch[1]] ?? null
  }
  return null
}

function memberFieldForPath (path) {
  // Only these extraction paths map onto member-form fields today; other
  // member-form fields can never carry an uncertainty flag.
  const map = {
    'preferences.newsletterPrint': 'printedNewsletter',
    'preferences.duesMonthly': 'householdDues',
    'preferences.duesYearly': 'householdDues',
    'preferences.paymentMethod': 'miscNotes',
    'preferences.invoiceMailed': 'miscNotes',
  }
  return map[path] ?? null
}

function buildUncertainMap (extraction, resolver) {
  const out = {}
  for (const u of extraction.uncertainFields ?? []) {
    const field = resolver(u.path)
    if (field && !out[field]) out[field] = { reason: u.reason, alternative: u.alternative }
  }
  return out
}

export function uncertainMapForPerson (extraction, memberIndex) {
  const map = buildUncertainMap(extraction, path => personFieldForPath(path, memberIndex))
  // The server returns villageId null when the extracted village name didn't
  // resolve — surface that as an uncertainty even when the model read the
  // name confidently, since the member step requires a home village.
  const village = extraction.application.village
  if (!map.villageId && village.villageName && village.villageId === null) {
    map.villageId = {
      reason: `"${village.villageName}" did not match any village — select one`,
      alternative: null,
    }
  }
  return map
}

export function uncertainMapForMember (extraction, memberIndex) {
  return buildUncertainMap(extraction, memberFieldForPath)
}

export function buildPersonCreatePayload (form) {
  const payload = {}
  Object.entries(form).forEach(([k, v]) => {
    if (v === '' || v === null || v === undefined) return
    payload[k] = v
  })
  return payload
}
