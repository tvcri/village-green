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

export function mapMemberForm (extraction, memberIndex, primaryPersonId) {
  const d = extraction.memberDefaults
  return {
    joinDate: s(d.joinDate),
    printedNewsletter: !!d.printedNewsletter,
    householdSize: extraction.application.householdType === 'Dual' ? 2 : 1,
    householdDues: d.duesYearly ?? d.duesMonthly ?? null,
    primaryPersonId: memberIndex > 0 ? primaryPersonId : '',
    miscNotes: composeNotes(extraction, memberIndex),
  }
}

const ACCESSIBILITY_LABELS = {
  difficultyHearing: 'Difficulty hearing', visionLimited: 'Vision limited',
  usesWalker: 'Uses walker', usesCane: 'Uses cane', usesWheelchair: 'Uses wheelchair',
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
  for (const [key, label] of Object.entries(ACCESSIBILITY_LABELS)) {
    push(label, extras.accessibility?.[key])
  }
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
  const map = {
    'application.applicationDate': 'joinDate',
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
  return buildUncertainMap(extraction, path => personFieldForPath(path, memberIndex))
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
