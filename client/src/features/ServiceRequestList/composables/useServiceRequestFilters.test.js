// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import { useServiceRequestFilters } from './useServiceRequestFilters.js'

const rows = () => ref([
  { serviceRequestId: '1', displayNumber: 101, memberFullName: 'Alice Anderson', volunteerFullName: 'Vera Volunteer', serviceName: 'Ride: Medical' },
  { serviceRequestId: '2', displayNumber: 202, memberFullName: 'Bob Brown', volunteerFullName: null, serviceName: 'Ride:Medical' },
  { serviceRequestId: '3', displayNumber: 303, memberFullName: 'Alice Anderson', volunteerFullName: 'Wes Worker', serviceName: 'Handyman' }
])

describe('useServiceRequestFilters', () => {
  it('returns all rows when no filter is set', () => {
    const { filteredRows } = useServiceRequestFilters(rows())
    expect(filteredRows.value).toHaveLength(3)
  })

  it('tolerates a null rows ref', () => {
    const { filteredRows } = useServiceRequestFilters(ref(null))
    expect(filteredRows.value).toEqual([])
  })

  it('filters by member', () => {
    const { selectedMember, filteredRows } = useServiceRequestFilters(rows())
    selectedMember.value = 'Alice Anderson'
    expect(filteredRows.value.map(r => r.serviceRequestId)).toEqual(['1', '3'])
  })

  it('filters by volunteer', () => {
    const { selectedVolunteer, filteredRows } = useServiceRequestFilters(rows())
    selectedVolunteer.value = 'Wes Worker'
    expect(filteredRows.value.map(r => r.serviceRequestId)).toEqual(['3'])
  })

  it('normalizes colon spacing when matching service names', () => {
    const { selectedService, filteredRows } = useServiceRequestFilters(rows())
    selectedService.value = 'Ride: Medical'
    // Must match BOTH 'Ride: Medical' and 'Ride:Medical'.
    expect(filteredRows.value.map(r => r.serviceRequestId)).toEqual(['1', '2'])
  })

  it('filters by partial displayNumber via idSearch', () => {
    const { idSearch, filteredRows } = useServiceRequestFilters(rows())
    idSearch.value = '20'
    expect(filteredRows.value.map(r => r.serviceRequestId)).toEqual(['2'])
  })

  it('combines filters conjunctively', () => {
    const { selectedMember, selectedService, filteredRows } = useServiceRequestFilters(rows())
    selectedMember.value = 'Alice Anderson'
    selectedService.value = 'Handyman'
    expect(filteredRows.value.map(r => r.serviceRequestId)).toEqual(['3'])
  })

  it('derives sorted, de-duplicated dropdown options and skips nulls', () => {
    const { memberNames, volunteerNames, serviceNames } = useServiceRequestFilters(rows())
    expect(memberNames.value).toEqual(['Alice Anderson', 'Bob Brown'])
    expect(volunteerNames.value).toEqual(['Vera Volunteer', 'Wes Worker'])
    // Service options collapse to one entry per NORMALIZED name (preserving the
    // village list's behavior): offering both 'Ride: Medical' and 'Ride:Medical'
    // would be two dropdown entries selecting an identical row set.
    expect(serviceNames.value).toEqual(['Handyman', 'Ride: Medical'])
  })

  it('clearAll resets every filter', () => {
    const f = useServiceRequestFilters(rows())
    f.selectedMember.value = 'Alice Anderson'
    f.idSearch.value = '101'
    f.clearAll()
    expect(f.selectedMember.value).toBe('')
    expect(f.idSearch.value).toBe('')
    expect(f.filteredRows.value).toHaveLength(3)
  })
})
