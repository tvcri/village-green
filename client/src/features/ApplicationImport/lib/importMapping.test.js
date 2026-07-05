import { describe, it, expect } from 'vitest'
import {
  mapPersonForm, personCommunityNames, mapMemberForm, composeNotes,
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
        },
      },
      {
        firstName: 'Al', middleInitial: null, lastName: 'Innovera', nickname: null,
        birthDate: '1946-07-19', street: null, unit: null, city: null, state: null, zip: null,
        email: null, phone: null, cell: '401-555-2222',
        extras: { pronouns: null, gender: 'M', veteran: 'No', accessibility: null },
      },
    ],
    emergencyContact: {
      firstName: 'Rob', middleInitial: null, lastName: 'Innovera',
      phoneHome: '401-555-9999', phoneCell: '401-555-3333', email: 'rob@example.com', relationship: 'Son',
    },
    preferences: { wantsVolunteerInfo: 'No', circleOfPrideJoin: 'Yes', circleOfPridePreferred: 'Yes' },
    memberDefaults: {
      joinDate: '2026-06-12', printedNewsletter: true,
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

describe('mapMemberForm', () => {
  it('maps defaults and household size for Dual', () => {
    const f = mapMemberForm(extraction(), 0, null)
    expect(f.joinDate).toBe('2026-06-12')
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
    expect(notes).toContain('Difficulty hearing: Sometimes')
    expect(notes).toContain('Circle of Pride preferred: Yes')
    expect(notes).toContain('Payment method: Personal Check')
    expect(notes).toContain('Dues (yearly): 120')
    expect(notes).toContain('Emergency contact home phone: 401-555-9999')
    expect(notes).not.toContain('Veteran')        // mapped to community
    expect(notes).not.toContain('null')
  })
  it('omits accessibility lines when accessibility is null', () => {
    expect(composeNotes(extraction(), 1)).not.toContain('hearing')
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
