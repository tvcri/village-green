import { describe, it, expect } from 'vitest'
import { GROUPS, groupFor, sentenceFor, actionsFor, formatValue, fieldLabel, RESOLVABLE_KINDS } from '../lib/holdReasons.js'

const EXPECTED_GROUPS = {
  maybe: ['name-only', 'multiple-matches', 'shared-email-different-name', 'same-address-last-name', 'already-linked-elsewhere', 'duplicate-in-lgl', 'import-hold', 'resolution-failed'],
  differ: ['never-agreed', 'both-changed', 'lgl-cleared', 'vg-cleared', 'lost-nickname', 'deceased-removed', 'phones-no-slot'],
  couple: ['couple'],
  finish: ['addressee', 'lgl-incomplete', 'po-box'],
  status: ['no-longer-donor', 'unlinked', 'lgl-missing'],
  wont: ['anonymous', 'deceased-in-lgl', 'couple-name', 'no-last-name', 'before-horizon'],
  skipped: ['import-skip'],
  engineer: ['unclean', 'ambiguous', 'vg-refused', 'lgl-refused', 'flapping', 'create-unfinished'],
}

const open = (reason, extra = {}) => ({ reason, state: 'open', personId: null, field: null, detail: null, resolution: null, ...extra })

describe('groupFor', () => {
  it('maps every reason the sync writes to its staff group', () => {
    for (const [key, reasons] of Object.entries(EXPECTED_GROUPS)) {
      for (const reason of reasons) expect(groupFor({ reason }).key, reason).toBe(key)
    }
  })
  it('puts an unknown reason with the engineer', () => {
    expect(groupFor({ reason: 'brand-new' }).key).toBe('engineer')
  })
  it('lists the groups staff work first and the engineer last', () => {
    expect(GROUPS.map(g => g.key)).toEqual(['maybe', 'differ', 'couple', 'finish', 'status', 'wont', 'skipped', 'engineer'])
  })
})

describe('sentenceFor', () => {
  it('says which side has a value when only one does', () => {
    expect(sentenceFor(open('never-agreed', { personId: '1', field: 'nickname', detail: { vg: null, lgl: 'Peg' } }))).toBe('Only LGL has a nickname.')
    expect(sentenceFor(open('never-agreed', { personId: '1', field: 'nickname', detail: { vg: 'Peg', lgl: '' } }))).toBe('Only VG has a nickname.')
  })
  it('passes the sync\'s message through for a failed resolution', () => {
    expect(sentenceFor(open('resolution-failed', { detail: { message: 'Doe, Jo is already linked to another LGL donor.' } })))
      .toBe('Doe, Jo is already linked to another LGL donor. Choose again.')
  })
  it('quotes the import review for an import hold', () => {
    expect(sentenceFor(open('import-hold', { detail: { importReason: 'Not confirmed on the Work list' } })))
      .toBe('Held at the November import review: Not confirmed on the Work list.')
  })
  it('falls back to the raw code', () => {
    expect(sentenceFor(open('brand-new'))).toBe('brand-new')
  })
})

describe('actionsFor', () => {
  it('lets staff link but not create a donor from before the horizon', () => {
    expect(actionsFor(open('before-horizon'))).toEqual(['link', 'seen'])
  })
  it('offers only mark-as-seen for anonymous donors', () => {
    expect(actionsFor(open('anonymous'))).toEqual(['seen'])
  })
  it('keeps New person available while a link is pending', () => {
    expect(actionsFor(open('name-only', { resolution: { kind: 'link', personId: '5' } }))).toEqual(['link', 'create', 'dontAdd'])
  })
  it('hides New person once it is the pending answer', () => {
    expect(actionsFor(open('name-only', { resolution: { kind: 'create' } }))).toEqual(['link', 'dontAdd'])
  })
  it('lets staff undo a staff-dismissed unlinked donor', () => {
    expect(actionsFor({ ...open('import-skip'), state: 'dismissed', dismissalKind: 'staff' })).toEqual(['link', 'create'])
    expect(actionsFor({ ...open('name-only'), state: 'dismissed', dismissalKind: 'rule' })).toEqual([])
  })
  it('closes the LGL-finish reasons with Done in LGL', () => {
    expect(actionsFor(open('addressee', { personId: '1' }))).toEqual(['doneInLgl'])
    expect(actionsFor(open('po-box', { personId: '1', field: 'address' }))).toEqual(['seen'])
  })
  it('gives the engineer\'s reasons no action', () => {
    expect(actionsFor(open('unclean', { personId: '1', field: 'phones' }))).toEqual([])
  })
  it('offers nothing on a closed hold', () => {
    expect(actionsFor({ ...open('name-only'), state: 'closed' })).toEqual([])
  })
  it('mirrors the API\'s resolvable kinds', () => {
    expect(RESOLVABLE_KINDS['before-horizon']).toEqual(['link'])
    expect(RESOLVABLE_KINDS.anonymous).toBeUndefined()
  })
})

describe('values', () => {
  it('joins an address\'s non-empty parts', () => {
    expect(formatValue('address', { street: '1 Elm', unit: null, city: 'Bristol', state: 'RI', zip: '02809' })).toBe('1 Elm, Bristol, RI, 02809')
  })
  it('labels phones', () => {
    expect(formatValue('phones', { phone: '401-555-0142', cell: null })).toBe('Phone 401-555-0142')
  })
  it('treats empty as null', () => {
    expect(formatValue('nickname', '')).toBeNull()
    expect(formatValue('address', null)).toBeNull()
  })
  it('names fields in staff terms', () => {
    expect(fieldLabel('firstName')).toBe('First name')
    expect(fieldLabel('mystery')).toBe('mystery')
  })
})
