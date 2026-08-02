// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import { useServiceRequestFilters } from './useServiceRequestFilters.js'

const rows = () => ref([
  { serviceRequestId: '1', displayNumber: 101, memberFullName: 'Alice Anderson', volunteerFullName: 'Vera Volunteer', serviceName: 'Ride: Medical', status: 'Open' },
  { serviceRequestId: '2', displayNumber: 202, memberFullName: 'Bob Brown', volunteerFullName: null, serviceName: 'Ride:Medical', status: 'Confirmed' },
  { serviceRequestId: '3', displayNumber: 303, memberFullName: 'Alice Anderson', volunteerFullName: 'Wes Worker', serviceName: 'Handyman', status: 'Open' }
])

// The API returns the raw DB status, so 'cancelled' spans three values.
const closedRows = () => ref([
  { serviceRequestId: '10', displayNumber: 1, status: 'Completed' },
  { serviceRequestId: '11', displayNumber: 2, status: 'Unmatched' },
  { serviceRequestId: '12', displayNumber: 3, status: 'Member cancelled' },
  { serviceRequestId: '13', displayNumber: 4, status: 'Volunteer cancelled' },
  { serviceRequestId: '14', displayNumber: 5, status: 'Hub cancelled' }
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
    f.selectedStatuses.value = ['open']
    f.clearAll()
    expect(f.selectedMember.value).toBe('')
    expect(f.idSearch.value).toBe('')
    expect(f.selectedStatuses.value).toEqual([])
    expect(f.filteredRows.value).toHaveLength(3)
  })

  describe('status filtering', () => {
    it('shows every row when no status is selected', () => {
      const { selectedStatuses, filteredRows } = useServiceRequestFilters(rows())
      expect(selectedStatuses.value).toEqual([])
      expect(filteredRows.value).toHaveLength(3)
    })

    it('filters by a single status, matching case-insensitively', () => {
      const { selectedStatuses, filteredRows } = useServiceRequestFilters(rows())
      selectedStatuses.value = ['open']
      expect(filteredRows.value.map(r => r.serviceRequestId)).toEqual(['1', '3'])
    })

    it('unions multiple selected statuses', () => {
      const { selectedStatuses, filteredRows } = useServiceRequestFilters(rows())
      selectedStatuses.value = ['open', 'confirmed']
      expect(filteredRows.value).toHaveLength(3)
    })

    it('matches all three cancelled db statuses under one "cancelled" key', () => {
      const { selectedStatuses, filteredRows } = useServiceRequestFilters(closedRows())
      selectedStatuses.value = ['cancelled']
      expect(filteredRows.value.map(r => r.serviceRequestId)).toEqual(['12', '13', '14'])
    })

    it('does not confuse completed with cancelled', () => {
      const { selectedStatuses, filteredRows } = useServiceRequestFilters(closedRows())
      selectedStatuses.value = ['completed']
      expect(filteredRows.value.map(r => r.serviceRequestId)).toEqual(['10'])
    })

    it('combines status with the other filters conjunctively', () => {
      const { selectedStatuses, selectedMember, filteredRows } = useServiceRequestFilters(rows())
      selectedStatuses.value = ['open']
      selectedMember.value = 'Alice Anderson'
      expect(filteredRows.value.map(r => r.serviceRequestId)).toEqual(['1', '3'])
    })
  })

  describe('initial statuses', () => {
    it('defaults selectedStatuses to [] when no option is passed', () => {
      const { selectedStatuses } = useServiceRequestFilters(ref([]))
      expect(selectedStatuses.value).toEqual([])
    })

    it('seeds selectedStatuses from initialStatuses', () => {
      const { selectedStatuses } = useServiceRequestFilters(ref([]), {
        initialStatuses: ['open', 'confirmed']
      })
      expect(selectedStatuses.value).toEqual(['open', 'confirmed'])
    })

    it('filters rows by the seeded statuses immediately', () => {
      const rows = ref([
        { serviceRequestId: 1, status: 'Open' },
        { serviceRequestId: 2, status: 'Completed' }
      ])
      const { filteredRows } = useServiceRequestFilters(rows, {
        initialStatuses: ['open', 'confirmed']
      })
      expect(filteredRows.value.map(r => r.serviceRequestId)).toEqual([1])
    })

    it('clearAll clears to no status filter, not back to the seed', () => {
      const rows = ref([
        { serviceRequestId: 1, status: 'Open' },
        { serviceRequestId: 2, status: 'Completed' }
      ])
      const f = useServiceRequestFilters(rows, { initialStatuses: ['open'] })
      f.clearAll()
      expect(f.selectedStatuses.value).toEqual([])
      expect(f.filteredRows.value.map(r => r.serviceRequestId)).toEqual([1, 2])
    })

    it('does not alias the caller array', () => {
      const seed = ['open']
      const { selectedStatuses } = useServiceRequestFilters(ref([]), { initialStatuses: seed })
      selectedStatuses.value.push('confirmed')
      expect(seed).toEqual(['open'])
    })

    // Deliberate: dropdown options are derived from every fetched row in the
    // date window, not from status-filtered rows. Otherwise a member whose
    // only requests are e.g. Completed would vanish from the Member dropdown
    // under the default open+confirmed filter, and the option list would
    // churn as the user toggles statuses.
    it('keeps a status-filtered-out member in memberNames', () => {
      const rows = ref([
        { serviceRequestId: 1, memberFullName: 'Completed Carl', status: 'Completed' },
        { serviceRequestId: 2, memberFullName: 'Open Olivia', status: 'Open' }
      ])
      const { filteredRows, memberNames } = useServiceRequestFilters(rows, {
        initialStatuses: ['open', 'confirmed']
      })
      expect(filteredRows.value.map(r => r.serviceRequestId)).toEqual([2])
      expect(memberNames.value).toContain('Completed Carl')
    })
  })
})
