import { describe, it, expect } from 'vitest'
import { personExportColumns, personExportValues, formatLanguages, PERSON_EXPORT_COLUMNS } from './personExport.js'

const keys = cols => cols.map(c => c.key)

describe('personExportColumns', () => {
  it('keeps every column for a viewer holding both gates', () => {
    expect(keys(personExportColumns({ birthDate: true, demographics: true }))).toEqual(keys(PERSON_EXPORT_COLUMNS))
  })

  it('drops birth date and the four demographic columns, nothing else, without the gates', () => {
    const kept = keys(personExportColumns({ birthDate: false, demographics: false }))
    expect(kept).not.toContain('birthDate')
    for (const k of ['gender', 'ethnicity', 'races', 'isVeteran']) expect(kept).not.toContain(k)
    expect(kept).toHaveLength(PERSON_EXPORT_COLUMNS.length - 5)
  })

  it('gates independently', () => {
    const kept = keys(personExportColumns({ birthDate: true, demographics: false }))
    expect(kept).toContain('birthDate')
    expect(kept).not.toContain('gender')
  })
})

describe('personExportValues', () => {
  const person = {
    firstName: 'Robert', middleInitial: 'A', lastName: 'Currie', suffix: 'Jr.',
    preferredContactMethod: { contactMethodId: '2', name: 'Cell' },
    languages: [{ name: 'Spanish', isPreferred: true }, { name: 'English', isPreferred: false }],
    gender: { name: 'Male' }, ethnicity: { name: 'Not Hispanic or Latino' },
    races: [{ name: 'Asian' }, { name: 'White' }], isVeteran: false,
    circles: [{ name: 'OakHill' }],
    disabilities: [{ name: 'Hearing', note: 'Slight' }, { name: 'Vision', note: null }],
  }

  it('flattens lookups and lists to text', () => {
    const v = personExportValues(person)
    expect(v.preferredContact).toBe('Cell')
    expect(v.languages).toBe('Spanish (preferred), English')
    expect(v.gender).toBe('Male')
    expect(v.races).toBe('Asian, White')
    expect(v.circles).toBe('OakHill')
    expect(v.disabilities).toBe('Hearing (Slight); Vision')
  })

  it('writes Veteran as Yes / No, and blank when unknown', () => {
    expect(personExportValues({ isVeteran: true }).isVeteran).toBe('Yes')
    expect(personExportValues({ isVeteran: false }).isVeteran).toBe('No')
    expect(personExportValues({ isVeteran: null }).isVeteran).toBe('')
    expect(personExportValues({}).isVeteran).toBe('')
  })

  it('leaves absent (permission-omitted) fields blank rather than throwing', () => {
    const v = personExportValues({ firstName: 'Ann' })
    expect(v.gender).toBe('')
    expect(v.races).toBe('')
    expect(v.languages).toBe('')
    expect(v.preferredContact).toBe('')
  })

  it('formatLanguages matches the detail card', () => {
    expect(formatLanguages([{ name: 'English', isPreferred: true }])).toBe('English (preferred)')
    expect(formatLanguages(undefined)).toBe('')
  })
})
