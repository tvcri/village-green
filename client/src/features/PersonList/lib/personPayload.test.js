import { describe, it, expect } from 'vitest'
import { emptyPersonFields, personFormFromApi, addPersonFields } from './personPayload.js'

const apiPerson = {
  suffix: 'Jr.', pronouns: 'he/him', deceasedDate: null,
  preferredContactMethod: { contactMethodId: '2', name: 'Cell' },
  gender: { genderId: '2', name: 'Male' },
  ethnicity: null,
  isVeteran: false,
  races: [{ raceId: '5', name: 'White' }],
  languages: [
    { languageId: '1', name: 'English', tag: 'en', isPreferred: false },
    { languageId: '4', name: 'Italian', tag: 'it', isPreferred: true },
  ],
}

describe('personFormFromApi', () => {
  it('flattens lookup objects to ids and splits languages into ids + preferred', () => {
    expect(personFormFromApi(apiPerson)).toEqual({
      suffix: 'Jr.', pronouns: 'he/him', deceasedDate: '',
      preferredContactMethodId: '2', genderId: '2', ethnicityId: null,
      isVeteran: false, raceIds: ['5'],
      languageIds: ['1', '4'], preferredLanguageId: '4',
    })
  })

  it('loads absent demographic keys (no permission) as empty', () => {
    const f = personFormFromApi({ languages: [] })
    expect(f.genderId).toBeNull()
    expect(f.isVeteran).toBeNull()
    expect(f.raceIds).toEqual([])
    expect(f.preferredLanguageId).toBeNull()
  })
})

describe('addPersonFields', () => {
  const opts = (o = {}) => ({ isEdit: true, showDemographics: true, ...o })

  it('sends isVeteran false as false, not as a blank', () => {
    const p = addPersonFields({}, { ...emptyPersonFields(), isVeteran: false }, opts({ isEdit: false }))
    expect(p.isVeteran).toBe(false)
  })

  it('nulls cleared scalars on edit and omits them on create', () => {
    const edit = addPersonFields({}, emptyPersonFields(), opts())
    expect(edit).toMatchObject({ suffix: null, pronouns: null, deceasedDate: null, preferredContactMethodId: null, genderId: null, ethnicityId: null, isVeteran: null })
    const create = addPersonFields({}, emptyPersonFields(), opts({ isEdit: false }))
    for (const k of ['suffix', 'pronouns', 'deceasedDate', 'preferredContactMethodId', 'genderId', 'ethnicityId', 'isVeteran']) {
      expect(k in create).toBe(false)
    }
  })

  it('omits every demographic key without the permission, even with loaded values', () => {
    const fields = personFormFromApi(apiPerson)
    const p = addPersonFields({}, fields, opts({ showDemographics: false }))
    for (const k of ['genderId', 'ethnicityId', 'isVeteran', 'races']) expect(k in p).toBe(false)
    expect(p.suffix).toBe('Jr.')
  })

  it('always sends races and languages as whole sets', () => {
    const p = addPersonFields({}, personFormFromApi(apiPerson), opts())
    expect(p.races).toEqual(['5'])
    expect(p.languages).toEqual([
      { languageId: '1', isPreferred: false },
      { languageId: '4', isPreferred: true },
    ])
  })

  it('marks nothing preferred when the preferred language is not in the set', () => {
    const p = addPersonFields({}, { ...emptyPersonFields(), languageIds: ['1'], preferredLanguageId: '4' }, opts())
    expect(p.languages).toEqual([{ languageId: '1', isPreferred: false }])
  })
})
