import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref } from 'vue'
import { usePersonListFilters } from './usePersonListFilters.js'

const row = (personId, o = {}) => ({
  personId, fullName: `Person${personId}, Test`, deceased: false,
  village: { villageId: 1, name: 'Alpha' }, activeAs: '[]',
  phone: { phone: null, cell: null }, email: null,
  memberStatus: null, volunteerStatus: null, volunteerPause: null,
  circles: [], isVeteran: false, ...o
})

const rows = () => [
  row(1, { memberStatus: 'Active', fullName: 'Brown, Naomi', phone: { phone: '4015551111', cell: '4015552222' }, email: 'naomi@example.org' }),
  row(2, { volunteerStatus: 'Pending', village: { villageId: 2, name: 'Beta' } }),
  row(3, { memberStatus: 'Dropped', volunteerStatus: 'Active' }),
  row(4, { memberStatus: 'Active', deceased: true }),
  row(5),
  row(6, { memberStatus: 'Active', circles: [{ circleId: 1, name: 'Circle of Pride' }] }),
  row(7, { isVeteran: true, fullName: 'Núñez, José', email: 'jose@example.org' }),
  row(8, { volunteerStatus: 'Active', volunteerPause: { startDate: null, endDate: null, scope: 'all' } })
]
const villages = [{ villageId: 1, name: 'Alpha' }, { villageId: 2, name: 'Beta' }]
const circles = [{ circleId: 1, name: 'Circle of Pride' }]

function make (persons = rows()) {
  return usePersonListFilters(ref(persons), ref(villages), ref(circles))
}
const ids = (f) => f.filteredPersons.value.map(p => p.personId)

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-29T16:00:00Z'))
})
afterEach(() => vi.useRealTimers())

describe('usePersonListFilters', () => {
  it('is null while persons is null and shows everyone with no filter', () => {
    expect(usePersonListFilters(ref(null), ref(null), ref(null)).filteredPersons.value).toBeNull()
    const f = make()
    expect(ids(f)).toHaveLength(8)
    expect(f.hasFilter.value).toBe(false)
  })

  it('matches name word by word, folded', () => {
    const f = make()
    f.name.value = 'naomi brown'
    expect(ids(f)).toEqual([1])
    f.name.value = 'brown, n'
    expect(ids(f)).toEqual([1])
    f.name.value = 'nunez jose'
    expect(ids(f)).toEqual([7])
  })

  it('matches phone against phone or cell, including JSON strings', () => {
    const f = make([row(1, { phone: JSON.stringify({ phone: '4015551111', cell: null }) }), row(2, { phone: { phone: null, cell: '4015552222' } }), row(3)])
    f.phone.value = '1111'
    expect(ids(f)).toEqual([1])
    f.phone.value = '2222'
    expect(ids(f)).toEqual([2])
  })

  it('matches email accent-insensitively', () => {
    const f = make([row(1, { email: 'josé@example.org' }), row(2, { email: 'x@example.org' })])
    f.email.value = 'JOSE@'
    expect(ids(f)).toEqual([1])
  })

  it('filters by village and exposes its id', () => {
    const f = make()
    expect(f.selectedVillage.value).toBe('All villages')
    expect(f.selectedVillageId.value).toBeUndefined()
    f.selectedVillage.value = 'Beta'
    expect(f.selectedVillageId.value).toBe(2)
    expect(ids(f)).toEqual([2])
  })

  it('tags, any', () => {
    const f = make()
    f.selectedTags.value = ['member:active']
    expect(ids(f)).toEqual([1, 6])
  })

  it('tags, all', () => {
    const f = make()
    f.selectedTags.value = ['member:dropped', 'volunteer:active']
    f.matchMode.value = 'all'
    expect(ids(f)).toEqual([3])
  })

  it('tags, exact', () => {
    const f = make()
    f.selectedTags.value = ['member:active']
    f.matchMode.value = 'exact'
    // 6 is in a circle too; no circle is picked, so circles are ignored.
    expect(ids(f)).toEqual([1, 6])
    f.selectedTags.value = ['member:active', 'circle:1']
    expect(ids(f)).toEqual([6])
  })

  it('two statuses of one role OR under All (VG-202611-520)', () => {
    const f = make()
    f.selectedTags.value = ['member:active', 'member:dropped']
    f.matchMode.value = 'all'
    // 4 is deceased, so their Active membership shows as dropped.
    expect(ids(f)).toEqual([1, 3, 4, 6])
  })

  it('emailPausedOnly and veteranOnly, ANDed with tags', () => {
    const f = make()
    f.emailPausedOnly.value = true
    expect(ids(f)).toEqual([8])
    f.emailPausedOnly.value = false
    f.veteranOnly.value = true
    expect(ids(f)).toEqual([7])
    f.emailPausedOnly.value = true
    expect(ids(f)).toEqual([])
    f.veteranOnly.value = false
    f.selectedTags.value = ['member:active']
    expect(ids(f)).toEqual([])
    f.selectedTags.value = ['volunteer:active']
    expect(ids(f)).toEqual([8])
  })

  it('deceasedOnly keeps only deceased people, ANDed with tags', () => {
    const f = make()
    f.deceasedOnly.value = true
    expect(ids(f)).toEqual([4])
    expect(f.activeFilterCount.value).toBe(1)
    // A deceased person's Active role shows as dropped, so it matches there.
    f.selectedTags.value = ['member:dropped']
    expect(ids(f)).toEqual([4])
    f.selectedTags.value = ['member:active']
    expect(ids(f)).toEqual([])
  })

  it('an expired pause does not count as email paused', () => {
    const f = make([row(1, { volunteerStatus: 'Active', volunteerPause: { startDate: '2026-01-01', endDate: '2026-02-01', scope: 'window' } })])
    f.emailPausedOnly.value = true
    expect(ids(f)).toEqual([])
  })

  it('counts active filters; mode alone is not one', () => {
    const f = make()
    f.matchMode.value = 'all'
    expect(f.activeFilterCount.value).toBe(0)
    f.name.value = 'a'
    f.selectedVillage.value = 'Alpha'
    f.selectedTags.value = ['member:active', 'circle:1']
    f.emailPausedOnly.value = true
    expect(f.activeFilterCount.value).toBe(5)
    expect(f.hasFilter.value).toBe(true)
  })

  it('builds circleNameById from the catalog, falling back to row circles', () => {
    const f = usePersonListFilters(
      ref([row(1, { circles: [{ circleId: 2, name: 'Veteran\'s Circle' }] })]), ref(villages), ref(circles))
    expect(f.circleNameById.value.get('1')).toBe('Circle of Pride')
    expect(f.circleNameById.value.get('2')).toBe('Veteran\'s Circle')
  })

  it('describes the selection in a sentence', () => {
    const f = make()
    expect(f.sentence.value).toBe('')
    f.selectedTags.value = ['circle:1']
    expect(f.sentence.value).toBe('People who are in Circle of Pride')
  })

  it('clearAll resets everything', () => {
    const f = make()
    f.name.value = 'a'; f.phone.value = '1'; f.email.value = 'e'
    f.selectedVillage.value = 'Beta'
    f.selectedTags.value = ['member:active']
    f.emailPausedOnly.value = true; f.veteranOnly.value = true; f.deceasedOnly.value = true
    f.matchMode.value = 'exact'
    f.clearAll()
    expect([f.name.value, f.phone.value, f.email.value]).toEqual(['', '', ''])
    expect(f.selectedVillage.value).toBe('All villages')
    expect(f.selectedTags.value).toEqual([])
    expect(f.emailPausedOnly.value).toBe(false)
    expect(f.veteranOnly.value).toBe(false)
    expect(f.deceasedOnly.value).toBe(false)
    expect(f.matchMode.value).toBe('any')
  })

  it('a donor window filters on the last gift date and passes today', () => {
    const f = make([
      row(1, { donor: { lglConstituentId: 'L1', lastGiftDate: '2025-06-01' } }),
      row(2, { donor: { lglConstituentId: 'L2', lastGiftDate: '2015-01-01' } })
    ])
    f.selectedTags.value = ['donor:5y']
    expect(ids(f)).toEqual([1])
  })
})
