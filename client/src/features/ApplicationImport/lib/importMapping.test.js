import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  mapPersonForm, personDisabilities, mapMemberForm, composeNotes,
  uncertainMapForPerson, uncertainMapForMember, buildPersonCreatePayload,
  mapVolunteerPersonForm, volunteerCapabilityNames, uncertainMapForVolunteerPerson,
  buildApplicationEnvelope, veteranAnswer, mergeCirclePreferences,
  personExtrasFields, matchGender, initialCircleNames,
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
  it('seeds town empty — PersonFormFields calculates it on mount, not the extraction', () => {
    const f = mapPersonForm(extraction(), 0)
    expect(f.town).toBe('')
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
    expect(f.printedNewsletter).toBe(true)
    expect(f.householdSize).toBe(2)
    expect(f.primaryPersonId).toBe('')
    expect(f.miscNotes).not.toContain('Pronouns')
  })
  it('sets primaryPersonId for the second member', () => {
    const f = mapMemberForm(extraction(), 1, 42)
    expect(f.primaryPersonId).toBe(42)
  })

  describe('memberLevel is derived from the member index', () => {
    it('makes the first member Primary', () => {
      expect(mapMemberForm(extraction(), 0, null).memberLevel).toBe('Primary')
    })
    it('makes a subsequent member Secondary', () => {
      expect(mapMemberForm(extraction(), 1, 42).memberLevel).toBe('Secondary')
    })
  })

  describe('joinDate defaults to today', () => {
    // joinDate is when the member record is created, not the application date.
    afterEach(() => { vi.useRealTimers() })

    it('prefills the current date', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date(2026, 7, 9, 12, 0, 0))   // 2026-08-09, local
      expect(mapMemberForm(extraction(), 0, null).joinDate).toBe('2026-08-09')
    })

    it('uses the local civil date, not UTC', () => {
      // 8pm local in a negative-offset zone is already the next day in UTC;
      // joinDate is a civil DATE and must not roll forward.
      vi.useFakeTimers()
      vi.setSystemTime(new Date(2026, 7, 9, 20, 30, 0))
      expect(mapMemberForm(extraction(), 0, null).joinDate).toBe('2026-08-09')
    })
  })

  describe('householdDues is always monthly', () => {
    const withDues = (duesMonthly, duesYearly) => {
      const e = extraction()
      Object.assign(e.memberDefaults, { duesMonthly, duesYearly })
      return mapMemberForm(e, 0, null).householdDues
    }
    it('divides a yearly amount by 12', () => {
      expect(withDues(null, 120)).toBe(10)
    })
    it('rounds a yearly amount that does not divide evenly to cents', () => {
      expect(withDues(null, 125)).toBe(10.42)
    })
    it('uses a monthly amount as-is', () => {
      expect(withDues(25, null)).toBe(25)
    })
    it('prefers the monthly amount when the form carries both', () => {
      expect(withDues(25, 120)).toBe(25)
    })
    it('is null when neither amount was extracted', () => {
      expect(withDues(null, null)).toBeNull()
    })
  })
})

describe('composeNotes', () => {
  it('includes unmapped extras and preferences, skips nulls and mapped fields', () => {
    const notes = composeNotes(extraction(), 0)
    expect(notes).toContain('Imported from application PDF')
    expect(notes).toContain('Ambassador: Pat Smith')
    expect(notes).not.toContain('Gender')      // now a person field (genderId)
    expect(notes).not.toContain('Pronouns')    // now a person field
    expect(notes).toContain('Circle of Pride preferred: Yes')
    expect(notes).toContain('Payment method: Personal Check')
    expect(notes).toContain('Dues (yearly): 120')
    expect(notes).toContain('Emergency contact home phone: 401-555-9999')
    expect(notes).toContain('Accessibility notes: Hearing: uses hearing aids sometimes.')
    expect(notes).not.toContain('Veteran')        // not a notes field; isVeteran arrives with the application-JSON work
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
  it('carries a calculated town through, and drops it when still empty', () => {
    const withTown = buildPersonCreatePayload({ firstName: 'Al', town: 'South Kingstown' })
    expect(withTown.town).toBe('South Kingstown')
    const withoutTown = buildPersonCreatePayload({ firstName: 'Al', town: '' })
    expect(withoutTown.town).toBeUndefined()
  })
})

function volunteerExtraction () {
  return {
    applicationType: 'volunteer',
    application: {
      applicationDate: '2026-05-30',
      village: { villageId: 7, villageName: 'Barrington Village' },
      ambassador: null,
    },
    person: {
      firstName: 'Nicole', middleInitial: 'K', lastName: 'Brown', nickname: null,
      pronouns: 'she/her', birthDate: '1999-07-10', gender: 'Female', veteran: 'No',
      language: null, street: '5 Sherbrooke Rd', unit: null, city: 'Barrington', state: 'RI', zip: '02806',
      email: 'labrown8025@gmail.com', phone: null, cell: '401-497-0470',
    },
    emergencyContact: {
      firstName: 'Laurie', middleInitial: null, lastName: 'Brown',
      phoneHome: null, phoneCell: '401-497-0470', email: 'labrown8025@gmail.com', relationship: 'Parent/Guardian',
    },
    capabilityNames: ['Errands'],
    circleOfPrideJoin: 'No',
    notes: 'Nicole is a special needs adult...',
    uncertainFields: [
      { path: 'person.zip', reason: 'digit unclear', alternative: '02807' },
      { path: 'application.villageName', reason: 'abbreviated with "Village" suffix', alternative: null },
      { path: 'emergencyContact.phoneCell', reason: 'smudged', alternative: null },
    ],
  }
}

describe('mapVolunteerPersonForm', () => {
  it('maps the single person and emergency contact, no household fallback needed', () => {
    const f = mapVolunteerPersonForm(volunteerExtraction())
    expect(f.firstName).toBe('Nicole')
    expect(f.zip).toBe('02806')
    expect(f.villageId).toBe(7)
    expect(f.emergencyContactName).toBe('Laurie Brown')
    expect(f.emergencyContactPhone).toBe('401-497-0470')
    expect(f.emergencyContactRelationship).toBe('Parent/Guardian')
  })
  it('seeds town empty — PersonFormFields calculates it on mount, not the extraction', () => {
    const f = mapVolunteerPersonForm(volunteerExtraction())
    expect(f.town).toBe('')
  })
})

describe('volunteerCapabilityNames', () => {
  it('wraps capabilityNames in a Set', () => {
    expect(volunteerCapabilityNames(volunteerExtraction())).toEqual(new Set(['Errands']))
  })
})

describe('uncertainMapForVolunteerPerson', () => {
  it('maps person/emergencyContact/village paths without a members[] index', () => {
    const m = uncertainMapForVolunteerPerson(volunteerExtraction())
    expect(m.zip).toEqual({ reason: 'digit unclear', alternative: '02807' })
    expect(m.villageId).toBeDefined()
    expect(m.emergencyContactPhone).toBeDefined()
  })
})

describe('buildApplicationEnvelope', () => {
  it('wraps the extraction minus usage, with memberIndex per member row', () => {
    const x = { ...extraction(), schemaVersion: 1, extractedAt: '2026-09-22T14:00:00.000Z', usage: { cost: 1 } }
    const e1 = buildApplicationEnvelope(x, 1)
    expect(e1).toMatchObject({ applicationType: 'member', schemaVersion: 1, extractedAt: '2026-09-22T14:00:00.000Z', memberIndex: 1 })
    expect(e1.extraction.usage).toBeUndefined()
    expect(e1.extraction).not.toHaveProperty('applicationType')
    expect(e1.extraction).not.toHaveProperty('schemaVersion')
    expect(e1.extraction).not.toHaveProperty('extractedAt')
    expect(e1.extraction.members).toHaveLength(2)
    expect(buildApplicationEnvelope(x, 0).memberIndex).toBe(0)
  })
  it('volunteer envelopes carry memberIndex null', () => {
    const v = { applicationType: 'volunteer', schemaVersion: 1, extractedAt: '2026-09-22T14:00:00.000Z', person: {}, usage: {} }
    expect(buildApplicationEnvelope(v, null).memberIndex).toBeNull()
  })
})

describe('veteranAnswer', () => {
  it('maps Yes/No to booleans and anything else to undefined', () => {
    expect(veteranAnswer('Yes')).toBe(true)
    expect(veteranAnswer('No')).toBe(false)
    expect(veteranAnswer('')).toBeUndefined()
    expect(veteranAnswer(null)).toBeUndefined()
  })
})

describe('mergeCirclePreferences', () => {
  it('adds Pride on Yes and keeps existing preferences', () => {
    expect(mergeCirclePreferences(['7'], '1', 'Yes')).toEqual(['7', '1'])
    expect(mergeCirclePreferences(['1'], '1', 'Yes')).toEqual(['1'])
  })
  it('returns undefined (send nothing) unless the answer is Yes', () => {
    expect(mergeCirclePreferences(['7'], '1', 'No')).toBeUndefined()
    expect(mergeCirclePreferences([], '1', '')).toBeUndefined()
    expect(mergeCirclePreferences([], undefined, 'Yes')).toBeUndefined()
  })
})

describe('personExtrasFields', () => {
  it('maps pronouns and a Yes/No veteran answer', () => {
    expect(personExtrasFields({ pronouns: 'she/her', veteran: 'Yes' })).toEqual({ pronouns: 'she/her', isVeteran: true })
    expect(personExtrasFields({ pronouns: null, veteran: 'No' })).toEqual({ pronouns: '', isVeteran: false })
  })
  it('keeps a blank veteran answer unknown (null), never false', () => {
    expect(personExtrasFields({ veteran: '' }).isVeteran).toBeNull()
    expect(personExtrasFields(undefined).isVeteran).toBeNull()
  })
})

describe('matchGender', () => {
  const genders = [{ genderId: '1', name: 'Female' }, { genderId: '2', name: 'Male' }, { genderId: '3', name: 'Other' }]
  it('matches a catalog name case-insensitively', () => {
    expect(matchGender('female', genders)).toEqual({ genderId: '1', uncertain: null })
    expect(matchGender(' Male ', genders)).toEqual({ genderId: '2', uncertain: null })
  })
  it('leaves an abbreviation blank and flags it rather than guessing', () => {
    const r = matchGender('F', genders)
    expect(r.genderId).toBeNull()
    expect(r.uncertain.reason).toBe('form said "F"; no matching option')
  })
  it('returns nothing to flag for a blank answer', () => {
    expect(matchGender('', genders)).toEqual({ genderId: null, uncertain: null })
    expect(matchGender(null, genders)).toEqual({ genderId: null, uncertain: null })
  })
})

describe('initialCircleNames', () => {
  it('pre-ticks Circle of Pride when the application answered Yes to joining', () => {
    expect([...initialCircleNames(extraction())]).toEqual(['Circle of Pride'])
  })
  it('pre-ticks nothing otherwise', () => {
    const x = extraction()
    x.preferences.circleOfPrideJoin = 'No'
    expect(initialCircleNames(x).size).toBe(0)
  })
})

describe('uncertain extras map onto person-form keys', () => {
  it('member: veteran → isVeteran, gender → genderId, pronouns → pronouns', () => {
    const x = extraction()
    x.uncertainFields = [
      { path: 'members[0].veteran', reason: 'illegible', alternative: null },
      { path: 'members[0].gender', reason: 'smudged', alternative: null },
      { path: 'members[0].pronouns', reason: 'faint', alternative: null },
    ]
    const m = uncertainMapForPerson(x, 0)
    expect(Object.keys(m)).toEqual(expect.arrayContaining(['isVeteran', 'genderId', 'pronouns']))
    expect(uncertainMapForPerson(x, 1).isVeteran).toBeUndefined()
  })
  it('volunteer: person.veteran → isVeteran', () => {
    const x = { application: { village: { villageId: 1, villageName: 'X' } }, uncertainFields: [{ path: 'person.veteran', reason: 'illegible', alternative: null }] }
    expect(uncertainMapForVolunteerPerson(x).isVeteran).toBeDefined()
  })
})
