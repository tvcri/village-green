import { describe, it, expect } from 'vitest'
import {
  mapPersonForm, personCommunityNames, personDisabilities, mapMemberForm, composeNotes,
  uncertainMapForPerson, uncertainMapForMember, buildPersonCreatePayload,
} from './importMapping.js'

function extraction () {
  return {
    applicationType: 'member',
    application: {
      applicationDate: '2026-06-12',
      village: { villageId: 1, villageName: 'Westside' },
      ambassador: 'Pat Smith',
      householdType: 'Dual',
    },
    members: [
      {
        firstName: 'Marge', middleInitial: 'A', lastName: 'Innovera', nickname: null,
        birthDate: '1948-03-02', street: '12 Elm St', unit: null, city: 'Providence',
        state: 'RI', zip: '02901', email: 'marge@example.com', phone: '401-555-1111', cell: null,
        extras: {
          pronouns: 'she/her', gender: 'F', veteran: 'Yes',
          accessibility: { difficultyHearing: 'Sometimes', visionLimited: 'No', usesWalker: 'No', usesCane: 'No', usesWheelchair: 'No' },
          accessibilityNotes: 'Hearing: uses hearing aids sometimes.',
        },
      },
      {
        firstName: 'Al', middleInitial: null, lastName: 'Innovera', nickname: null,
        birthDate: '1946-07-19', street: null, unit: null, city: null, state: null, zip: null,
        email: null, phone: null, cell: '401-555-2222',
        extras: { pronouns: null, gender: 'M', veteran: 'No', accessibility: null, accessibilityNotes: null },
      },
    ],
    emergencyContact: {
      firstName: 'Rob', middleInitial: null, lastName: 'Innovera',
      phoneHome: '401-555-9999', phoneCell: '401-555-3333', email: 'rob@example.com', relationship: 'Son',
    },
    preferences: { wantsVolunteerInfo: 'No', circleOfPrideJoin: 'Yes', circleOfPridePreferred: 'Yes' },
    memberDefaults: {
      printedNewsletter: true,
      duesMonthly: null, duesYearly: 120, paymentMethod: 'Personal Check', invoiceMailed: 'Yes',
    },
    uncertainFields: [
      { path: 'members[0].zip', reason: 'last digit ambiguous', alternative: '02907' },
      { path: 'members[1].birthDate', reason: 'year smudged', alternative: null },
      { path: 'emergencyContact.phoneCell', reason: 'digit unclear', alternative: null },
      { path: 'application.villageName', reason: 'abbreviated', alternative: null },
      { path: 'preferences.duesYearly', reason: 'overwritten amount', alternative: '150' },
    ],
  }
}

describe('mapPersonForm', () => {
  it('maps person 1 fields, joins emergency contact, prefers cell phone', () => {
    const f = mapPersonForm(extraction(), 0)
    expect(f.firstName).toBe('Marge')
    expect(f.zip).toBe('02901')
    expect(f.nickname).toBe('')
    expect(f.villageId).toBe(1)
    expect(f.emergencyContactName).toBe('Rob Innovera')
    expect(f.emergencyContactPhone).toBe('401-555-3333')
    expect(f.emergencyContactRelationship).toBe('Son')
  })
  it('falls back to person 1 address/phone for blanks on person 2', () => {
    const f = mapPersonForm(extraction(), 1)
    expect(f.firstName).toBe('Al')
    expect(f.street).toBe('12 Elm St')
    expect(f.city).toBe('Providence')
    expect(f.phone).toBe('401-555-1111')
    expect(f.cell).toBe('401-555-2222')
    expect(f.birthDate).toBe('1946-07-19')
  })
})

describe('personCommunityNames', () => {
  it('derives Veteran per member and Pride from application', () => {
    expect(personCommunityNames(extraction(), 0)).toEqual(new Set(['Veteran', 'Pride']))
    expect(personCommunityNames(extraction(), 1)).toEqual(new Set(['Pride']))
  })
})

describe('personDisabilities', () => {
  it('maps Yes/Sometimes accessibility answers to disability names, skips No', () => {
    const result = personDisabilities(extraction(), 0)
    // extraction()'s accessibilityNotes ("Hearing: uses hearing aids
    // sometimes.") is matched by keyword and its text attached as the note.
    expect(result).toEqual(new Map([['Hearing', 'uses hearing aids sometimes']]))
  })
  it('returns an empty map when accessibility is null', () => {
    expect(personDisabilities(extraction(), 1)).toEqual(new Map())
  })
  it('maps all five fields to their disability names when all are Yes', () => {
    const e = extraction()
    e.members[0].extras.accessibility = {
      difficultyHearing: 'Yes', visionLimited: 'Yes', usesWalker: 'Yes', usesCane: 'Yes', usesWheelchair: 'Yes',
    }
    const result = personDisabilities(e, 0)
    expect([...result.keys()].sort()).toEqual(['Cane', 'Hearing', 'Vision', 'Walker', 'Wheelchair'])
  })
  it('recovers the note and answer from an uncertainFields conflict when the model misreports it there', () => {
    // Real observed model behavior: despite the prompt saying not to, a
    // Yes-checked-but-Sometimes-explained field comes back as an uncertain
    // field instead of via accessibilityNotes.
    const e = extraction()
    e.members[0].extras.accessibility = {
      difficultyHearing: 'Sometimes', visionLimited: 'Sometimes', usesWalker: 'Sometimes',
      usesCane: 'No', usesWheelchair: 'No',
    }
    e.members[0].extras.accessibilityNotes = null
    e.uncertainFields = [
      { path: 'members[0].accessibility.difficultyHearing', reason: "Checkmark appears in Yes column but 'hearing aids' noted in Sometimes/explain", alternative: 'Yes' },
      { path: 'members[0].accessibility.visionLimited', reason: "Checkmark in Yes column but 'glasses' noted in explain", alternative: 'Yes' },
      { path: 'members[0].accessibility.usesWalker', reason: "Marks in both Yes and No columns with 'rollator (travel)' noted", alternative: 'Yes' },
    ]
    const result = personDisabilities(e, 0)
    expect(result.get('Hearing')).toBe('hearing aids')
    expect(result.get('Vision')).toBe('glasses')
    expect(result.get('Walker')).toBe('rollator (travel)')
  })
  it('falls back to the full reason text when it has no quoted note', () => {
    const e = extraction()
    e.members[0].extras.accessibility = { difficultyHearing: 'Sometimes', visionLimited: 'No', usesWalker: 'No', usesCane: 'No', usesWheelchair: 'No' }
    e.uncertainFields = [
      { path: 'members[0].accessibility.difficultyHearing', reason: 'Ambiguous checkbox with no legible explain text', alternative: null },
    ]
    const result = personDisabilities(e, 0)
    expect(result.get('Hearing')).toBe('Ambiguous checkbox with no legible explain text')
  })
  it('does not apply a conflict from a different member index', () => {
    const e = extraction()
    e.members[0].extras.accessibility = { difficultyHearing: 'Sometimes', visionLimited: 'No', usesWalker: 'No', usesCane: 'No', usesWheelchair: 'No' }
    e.members[0].extras.accessibilityNotes = null   // isolate member-index behavior from the notes fallback
    e.uncertainFields = [
      { path: 'members[1].accessibility.difficultyHearing', reason: "'note for the other member'", alternative: 'Yes' },
    ]
    const result = personDisabilities(e, 0)
    expect(result.get('Hearing')).toBeNull()
  })
  it('recovers per-field notes from accessibilityNotes when the model follows the prompt correctly', () => {
    // This is the expected/common model behavior per the prompt: no
    // uncertainFields conflict is reported, and the explain text instead
    // arrives verbatim in accessibilityNotes as "<Label>: <text>." sentences.
    const e = extraction()
    e.members[0].extras.accessibility = {
      difficultyHearing: 'Yes', visionLimited: 'Yes', usesWalker: 'Yes', usesCane: 'No', usesWheelchair: 'No',
    }
    e.members[0].extras.accessibilityNotes = 'Difficulty hearing: hearing aids. Vision limited: glasses. Uses walker: rollator (travel).'
    e.uncertainFields = []
    const result = personDisabilities(e, 0)
    expect(result.get('Hearing')).toBe('hearing aids')
    expect(result.get('Vision')).toBe('glasses')
    expect(result.get('Walker')).toBe('rollator (travel)')
  })
  it('matches by keyword when the model paraphrases the label instead of using it verbatim', () => {
    // Real observed model output: "Vision is limited: Glasses. Uses a
    // walker: Rollator." — different phrasing than the prompt's example
    // ("Vision limited: ...", "Uses walker: ..."), which an exact-label
    // match would miss entirely.
    const e = extraction()
    e.members[0].extras.accessibility = {
      difficultyHearing: 'No', visionLimited: 'Yes', usesWalker: 'Yes', usesCane: 'No', usesWheelchair: 'No',
    }
    e.members[0].extras.accessibilityNotes = 'Vision is limited: Glasses. Uses a walker: Rollator.'
    e.uncertainFields = []
    const result = personDisabilities(e, 0)
    expect(result.get('Vision')).toBe('Glasses')
    expect(result.get('Walker')).toBe('Rollator')
  })
  it('prefers the uncertainFields conflict note over accessibilityNotes when both are present', () => {
    const e = extraction()
    e.members[0].extras.accessibility = { difficultyHearing: 'Yes', visionLimited: 'No', usesWalker: 'No', usesCane: 'No', usesWheelchair: 'No' }
    e.members[0].extras.accessibilityNotes = 'Difficulty hearing: hearing aids.'
    e.uncertainFields = [
      { path: 'members[0].accessibility.difficultyHearing', reason: "Checkmark ambiguous, 'hearing aids and lip reading' noted", alternative: 'Yes' },
    ]
    const result = personDisabilities(e, 0)
    expect(result.get('Hearing')).toBe('hearing aids and lip reading')
  })
  it('leaves a Yes/Sometimes disability with no note when accessibilityNotes has no sentence for it', () => {
    const e = extraction()
    e.members[0].extras.accessibility = { difficultyHearing: 'Yes', visionLimited: 'No', usesWalker: 'No', usesCane: 'No', usesWheelchair: 'No' }
    e.members[0].extras.accessibilityNotes = ''
    e.uncertainFields = []
    const result = personDisabilities(e, 0)
    expect(result.get('Hearing')).toBeNull()
  })
})

describe('mapMemberForm', () => {
  it('maps defaults and household size for Dual', () => {
    const f = mapMemberForm(extraction(), 0, null)
    expect(f.joinDate).toBeUndefined()   // join date is set when the member record is created, not from the application
    expect(f.printedNewsletter).toBe(true)
    expect(f.householdSize).toBe(2)
    expect(f.householdDues).toBe(120)
    expect(f.primaryPersonId).toBe('')
    expect(f.miscNotes).toContain('Pronouns: she/her')
  })
  it('sets primaryPersonId for the second member', () => {
    const f = mapMemberForm(extraction(), 1, 42)
    expect(f.primaryPersonId).toBe(42)
  })
})

describe('composeNotes', () => {
  it('includes unmapped extras and preferences, skips nulls and mapped fields', () => {
    const notes = composeNotes(extraction(), 0)
    expect(notes).toContain('Imported from application PDF')
    expect(notes).toContain('Ambassador: Pat Smith')
    expect(notes).toContain('Gender: F')
    expect(notes).toContain('Circle of Pride preferred: Yes')
    expect(notes).toContain('Payment method: Personal Check')
    expect(notes).toContain('Dues (yearly): 120')
    expect(notes).toContain('Emergency contact home phone: 401-555-9999')
    expect(notes).toContain('Accessibility notes: Hearing: uses hearing aids sometimes.')
    expect(notes).not.toContain('Veteran')        // mapped to community
    expect(notes).not.toContain('Difficulty hearing')  // mapped to structured disabilities
    expect(notes).not.toContain('null')
  })
  it('omits accessibility notes line when accessibilityNotes is null', () => {
    expect(composeNotes(extraction(), 1)).not.toContain('Accessibility notes')
  })
})

describe('uncertain maps', () => {
  it('maps person-form paths for the right member index', () => {
    const m0 = uncertainMapForPerson(extraction(), 0)
    expect(m0.zip).toEqual({ reason: 'last digit ambiguous', alternative: '02907' })
    expect(m0.emergencyContactPhone).toBeDefined()
    expect(m0.villageId).toBeDefined()
    expect(m0.birthDate).toBeUndefined()          // that one belongs to member 1
    const m1 = uncertainMapForPerson(extraction(), 1)
    expect(m1.birthDate).toBeDefined()
    expect(m1.zip).toBeUndefined()
  })
  it('maps member-form paths', () => {
    const m = uncertainMapForMember(extraction(), 0)
    expect(m.householdDues).toEqual({ reason: 'overwritten amount', alternative: '150' })
  })
  it('synthesizes a villageId uncertainty when the village did not resolve', () => {
    const e = extraction()
    e.uncertainFields = []                       // model read the name confidently
    e.application.village = { villageId: null, villageName: 'Warwick Village' }
    const m = uncertainMapForPerson(e, 0)
    expect(m.villageId.reason).toContain('Warwick Village')
    // resolved village or no name at all -> no synthetic flag
    e.application.village = { villageId: 3, villageName: 'Warwick' }
    expect(uncertainMapForPerson(e, 0).villageId).toBeUndefined()
    e.application.village = { villageId: null, villageName: null }
    expect(uncertainMapForPerson(e, 0).villageId).toBeUndefined()
  })
})

describe('buildPersonCreatePayload', () => {
  it('drops empty values and keeps villageId', () => {
    const p = buildPersonCreatePayload({ firstName: 'Al', lastName: 'Innovera', nickname: '', email: null, villageId: 1 })
    expect(p).toEqual({ firstName: 'Al', lastName: 'Innovera', villageId: 1 })
  })
})
