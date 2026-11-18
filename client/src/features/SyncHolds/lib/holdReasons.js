// What the LGL sync's hold reasons mean to Hub staff. The sync (tvcri/vg-sync)
// distinguishes about 35 reasons; staff see a handful of plain situations.
// The codes are a closed vocabulary owned by the sync's code, so this is a
// constant, not a catalog. A reason missing here shows with the engineer.

export const GROUPS = [
  {
    key: 'maybe',
    title: 'LGL donors who may already be in VG',
    what: 'The sync found an LGL donor it could not match to one person for certain. Say who they are, or that they are someone new. The sync does the rest on its next run.',
    reasons: ['name-only', 'multiple-matches', 'shared-email-different-name', 'same-address-last-name', 'already-linked-elsewhere', 'duplicate-in-lgl', 'import-hold', 'resolution-failed'],
  },
  {
    key: 'differ',
    title: 'Details that differ between VG and LGL',
    what: 'Correct the detail in either system and the sync copies it across. If both are right as they are, mark it as seen.',
    reasons: ['never-agreed', 'both-changed', 'lgl-cleared', 'vg-cleared', 'lost-nickname', 'deceased-removed', 'phones-no-slot'],
  },
  {
    key: 'couple',
    title: 'Couples sharing one LGL record',
    what: 'LGL keeps one record for both partners; VG keeps each person. Nothing to fix. Mark as seen.',
    reasons: ['couple'],
  },
  {
    key: 'finish',
    title: 'To finish in LGL',
    what: 'The sync changed LGL but left one thing for a person to check there.',
    reasons: ['addressee', 'lgl-incomplete', 'po-box'],
  },
  {
    key: 'status',
    title: 'Donor status changes',
    what: 'For your information. If LGL is wrong, fix it there.',
    reasons: ['no-longer-donor', 'unlinked', 'lgl-missing'],
  },
  {
    key: 'wont',
    title: 'LGL donors the sync won’t add',
    what: 'The sync leaves these alone on purpose. Usually nothing to do.',
    reasons: ['anonymous', 'deceased-in-lgl', 'couple-name', 'no-last-name', 'before-horizon'],
  },
  {
    key: 'skipped',
    title: 'Skipped at the import review',
    what: 'Staff chose to leave these donors out in November. Change your mind here.',
    reasons: ['import-skip'],
  },
  {
    key: 'engineer',
    title: 'For the engineer',
    what: 'Nothing for staff to do. The engineer is told about these.',
    reasons: ['unclean', 'ambiguous', 'vg-refused', 'lgl-refused', 'flapping', 'create-unfinished'],
  },
]

const ENGINEER = GROUPS.at(-1)
const GROUP_BY_REASON = new Map(GROUPS.flatMap(g => g.reasons.map(r => [r, g])))

export const groupFor = (hold) => GROUP_BY_REASON.get(hold.reason) ?? ENGINEER

// Mirrors RESOLVABLE_KINDS in api/source/service/SyncService.js; the API is
// the authority, this decides which buttons show.
export const RESOLVABLE_KINDS = {
  'name-only': ['link', 'create'],
  'multiple-matches': ['link', 'create'],
  'shared-email-different-name': ['link', 'create'],
  'same-address-last-name': ['link', 'create'],
  'duplicate-in-lgl': ['link', 'create'],
  'import-hold': ['link', 'create'],
  'import-skip': ['link', 'create'],
  'resolution-failed': ['link', 'create'],
  'already-linked-elsewhere': ['link'],
  'before-horizon': ['link'],
}

// Reasons only a person closes, after doing something in LGL.
export const STAFF_CLOSED_REASONS = ['addressee', 'lgl-incomplete']

const FIELD_LABELS = {
  firstName: 'First name',
  lastName: 'Last name',
  nickname: 'Nickname',
  suffix: 'Suffix',
  email: 'Email',
  address: 'Address',
  phones: 'Phone numbers',
  deceased: 'Deceased',
}
export const fieldLabel = (field) => FIELD_LABELS[field] ?? field

const isEmpty = (v) => v == null || v === '' || (Array.isArray(v) && v.length === 0)

// One line of text for a value from either system, or null when empty.
export function formatValue (field, value) {
  if (isEmpty(value)) return null
  if (typeof value !== 'object') return String(value)
  if (Array.isArray(value)) return value.map(v => formatValue(field, v)).filter(Boolean).join(', ') || null
  if (field === 'phones') {
    const parts = [['Phone', value.phone], ['Cell', value.cell]].filter(([, n]) => !isEmpty(n)).map(([k, n]) => `${k} ${n}`)
    return parts.join(' · ') || null
  }
  if (field === 'deceased') return value.flag ? `Deceased${value.date ? ` ${value.date}` : ''}` : 'Not deceased'
  const parts = Object.values(value).filter(v => !isEmpty(v) && typeof v !== 'object').map(String)
  return parts.join(', ') || null
}

// The plain sentence a row leads with.
export function sentenceFor (hold) {
  const d = hold.detail ?? {}
  const f = fieldLabel(hold.field ?? '').toLowerCase()
  switch (hold.reason) {
    case 'name-only': return 'Same name as someone in VG, but no email in common.'
    case 'multiple-matches': return 'Matches more than one person in VG.'
    case 'shared-email-different-name': return 'Shares an email with someone in VG who has a different name.'
    case 'same-address-last-name': return 'Same last name and address as someone in VG.'
    case 'already-linked-elsewhere': return 'Matches someone in VG who is already linked to another LGL donor. LGL may have this donor twice.'
    case 'duplicate-in-lgl': return 'LGL seems to have this donor more than once.'
    case 'import-hold': return `Held at the November import review: ${d.importReason ?? 'no reason recorded'}.`
    case 'resolution-failed': return `${d.message ?? 'The sync could not carry out the answer.'} Choose again.`
    case 'import-skip': return 'Left out at the November import review.'
    case 'anonymous': return 'Given as Anonymous in LGL.'
    case 'deceased-in-lgl': return 'Marked deceased in LGL.'
    case 'couple-name': return 'LGL’s record names a couple, so the sync cannot add one person from it.'
    case 'no-last-name': return 'LGL’s record has no last name.'
    case 'before-horizon': return 'Last gift was too long ago for the sync to add them as a new person.'
    case 'never-agreed':
      if (isEmpty(d.vg) && !isEmpty(d.lgl)) return `Only LGL has a ${f}.`
      if (isEmpty(d.lgl) && !isEmpty(d.vg)) return `Only VG has a ${f}.`
      return `The ${f} differs, and the two have never matched.`
    case 'both-changed': return `The ${f} changed in both systems since they last matched.`
    case 'lgl-cleared': return `LGL no longer has a ${f}; VG still does.`
    case 'vg-cleared': return `VG no longer has a ${f}; LGL still does.`
    case 'lost-nickname': return 'A nickname would be lost if the sync copied this name across.'
    case 'deceased-removed': return 'One system no longer marks this person deceased.'
    case 'phones-no-slot': return 'LGL has more numbers than VG has room for (VG keeps a Phone and a Cell).'
    case 'couple': return 'Shares one LGL record with a partner. LGL’s name covers both of them.'
    case 'addressee': return 'The name changed in LGL, but the envelope name there was typed by hand, so the sync left it. Update it in LGL if it is out of date.'
    case 'lgl-incomplete': return 'The sync added the new entry in LGL. The old one may still be marked current there; check it.'
    case 'po-box': return 'LGL mails to a PO box, so the sync left the address alone.'
    case 'no-longer-donor': return 'LGL no longer counts them as a donor. VG still shows the Donor tag.'
    case 'unlinked': return 'The sync removed this person’s link to LGL.'
    case 'lgl-missing': return 'The LGL record this person was linked to is gone from LGL, perhaps merged into another.'
    case 'unclean': return 'The value in LGL could not be read.'
    case 'ambiguous': return 'LGL has more than one entry that could be the current one.'
    case 'vg-refused': return 'VG refused a change the sync tried to make.'
    case 'lgl-refused': return 'LGL refused a change the sync tried to make.'
    case 'flapping': return 'This keeps changing back and forth between the two systems.'
    case 'create-unfinished': return 'The sync added this person but did not finish linking them.'
  }
  return hold.reason
}

const isUnlinked = (hold) => hold.personId == null

// Which actions a row offers, in display order.
export function actionsFor (hold) {
  if (hold.state === 'closed') return []
  const kinds = isUnlinked(hold) ? (RESOLVABLE_KINDS[hold.reason] ?? []) : []
  if (hold.state === 'dismissed') {
    return isUnlinked(hold) && hold.dismissalKind === 'staff' ? [...kinds] : []
  }
  const out = []
  if (kinds.includes('link')) out.push('link')
  // A pending link can still become "New person"; only a pending create hides it.
  if (kinds.includes('create') && hold.resolution?.kind !== 'create') out.push('create')
  if (kinds.includes('create')) out.push('dontAdd')
  else if (STAFF_CLOSED_REASONS.includes(hold.reason)) out.push('doneInLgl')
  else if (groupFor(hold) !== ENGINEER) out.push('seen')
  return out
}
