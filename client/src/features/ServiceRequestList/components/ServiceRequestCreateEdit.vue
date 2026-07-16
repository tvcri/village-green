<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import Card from 'primevue/card'
import Button from 'primevue/button'
import SplitButton from 'primevue/splitbutton'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Textarea from 'primevue/textarea'
import DatePicker from 'primevue/datepicker'
import Select from 'primevue/select'
import AutoComplete from 'primevue/autocomplete'
import Tag from 'primevue/tag'
import Checkbox from 'primevue/checkbox'
import Popover from 'primevue/popover'
import { useAsyncState } from '../../../shared/composables/useAsyncState.js'
import { apiCall, isPrivacyAckError } from '../../../shared/api/apiClient.js'
import { getServiceRequest } from '../api/serviceRequestApi.js'
import { getVillages } from '../../VillageList/api/villageApi.js'
import { getVillageMembers } from '../../MemberList/api/memberApi.js'
import { getPerson } from '../../PersonList/api/personApi.js'
import { getVillageVolunteers, getVolunteers } from '../../VolunteerList/api/volunteerApi.js'
import { setPendingHighlight } from '../../../shared/lib/pendingHighlight.js'
import PersonDetailDialog from '../../../shared/components/PersonDetailDialog.vue'
import {
  minutesToTimeString, timeStringToMinutes,
  dateToServiceDate, serviceDateToDate
} from '../lib/timeFields.js'
import { useRequirePermission } from '../../../shared/composables/useRequirePermission.js'

defineOptions({ name: 'ServiceRequestCreateEdit' })

const router = useRouter()
const route = useRoute()
const toast = useToast()
const confirm = useConfirm()
useRequirePermission('sr:write')

const isEdit = computed(() => !!route.params.id)
const serviceRequestId = computed(() => route.params.id)

const { state: allVillages } = useAsyncState(
  () => getVillages(),
  { immediate: true }
)

const { state: villageMembers, execute: fetchMembers } = useAsyncState(
  () => form.value.villageId ? getVillageMembers(form.value.villageId) : null,
  { immediate: false }
)

const anyVillageVolunteers = ref(false)

const { state: villageVolunteers, execute: fetchVolunteers } = useAsyncState(
  () => {
    if (anyVillageVolunteers.value) return getVolunteers()
    return form.value.villageId ? getVillageVolunteers(form.value.villageId) : null
  },
  { immediate: false }
)

const { state: existingRequest, isLoading: isLoadingRequest } = useAsyncState(
  () => isEdit.value ? getServiceRequest(serviceRequestId.value) : null,
  { immediate: true }
)

const form = ref({
  villageId: '',
  memberPersonId: '',
  volunteerPersonId: '',
  status: '',
  serviceName: '',
  transportationType: '',
  createdAt: '',
  serviceDate: '',
  timesFlexible: false,
  startTime: null,
  finishTime: null,
  apptTime: null,
  returnTime: null,
  state: '',
  city: '',
  zip: '',
  address: '',
  phone: '',
  startAddress: '',
  startCity: '',
  startState: '',
  startZip: '',
  startPhone: '',
  instructions: '',
  description: '',
  destination: ''
})

const isSubmitting = ref(false)
const isCancelling = ref(false)
const cancelPopover = ref(null)
const isDraft = ref(false)
const wasLoadedAsDraft = ref(false)

// False while the existingRequest watcher is populating the form, so the
// isRideService watcher does not overwrite the API's transportationType.
// Starts true in create mode (no load needed); starts false in edit mode.
const formLoaded = ref(!isEdit.value)

watch(existingRequest, async (val) => {
  if (val && isEdit.value) {
    formLoaded.value = false
    isDraft.value = val.status === 'Draft'
    wasLoadedAsDraft.value = val.status === 'Draft'
    const extractDate = (dateStr) => {
      if (!dateStr) return ''
      return new Date(dateStr)
    }
    // A volunteer from outside the member's village only appears in the
    // "any village" list, so flip the checkbox before villageId's watcher
    // triggers fetchVolunteers, or the loaded volunteer won't be findable.
    anyVillageVolunteers.value = !!(val.volunteerVillageId && val.volunteerVillageId !== val.villageId)
    form.value = {
      villageId: val.villageId || '',
      memberPersonId: val.memberPersonId || '',
      volunteerPersonId: val.volunteerPersonId || '',
      status: val.status || '',
      serviceName: val.serviceName || '',
      transportationType: val.transportationType || '',
      createdAt: extractDate(val.createdAt),
      serviceDate: serviceDateToDate(val.serviceDate),
      timesFlexible: !!val.timesFlexible,
      startTime: timeStringToMinutes(val.startTime),
      finishTime: timeStringToMinutes(val.finishTime),
      apptTime: timeStringToMinutes(val.apptTime),
      returnTime: timeStringToMinutes(val.returnTime),
      state: val.state || '',
      city: val.city || '',
      zip: val.zip || '',
      address: val.address || '',
      phone: val.phone || '',
      startAddress: val.startAddress || '',
      startCity: val.startCity || '',
      startState: val.startState || '',
      startZip: val.startZip || '',
      startPhone: val.startPhone || '',
      instructions: val.instructions || '',
      description: val.description || '',
      destination: val.destination || ''
    }
    await nextTick()
    formLoaded.value = true
  }
})

const villageOptions = computed(() => (allVillages.value ?? []).map(v => ({ label: v.name, value: v.villageId })))

const allMemberOptions = computed(() => {
  if (!Array.isArray(villageMembers.value)) return []
  return villageMembers.value.map(m => ({
    label: m.personFullName || m.fullName,
    value: String(m.personId || m.id)
  }))
})

const selectedMemberServiceNotes = computed(() => {
  if (!Array.isArray(villageMembers.value) || !form.value.memberPersonId) return ''
  const member = villageMembers.value.find(m => String(m.personId || m.id) === String(form.value.memberPersonId))
  return member?.serviceNotes || ''
})

const allVolunteerOptions = computed(() => {
  if (!Array.isArray(villageVolunteers.value)) return []
  return villageVolunteers.value.map(v => ({
    label: v.personFullName || v.fullName,
    value: String(v.personId || v.id)
  }))
})

const memberFilteredOptions = ref([])
const volunteerFilteredOptions = ref([])
const selectedMember = ref(null)
const selectedVolunteer = ref(null)

// The selected member's home address, fetched on member-select. getVillageMembers
// omits address fields, so fetch the person to obtain home. "Member's home" is a
// fill convenience only — never stored as SR state.
const selectedMemberHome = ref(null)

async function loadMemberHome (personId) {
  if (!personId) { selectedMemberHome.value = null; return }
  try {
    const p = await getPerson(String(personId))
    selectedMemberHome.value = p
      ? { address: p.address || '', city: p.city || '', state: p.state || '', zip: p.zip || '', phone: p.phone || '' }
      : null
  } catch {
    selectedMemberHome.value = null
  }
}

function applyMemberHomeToStart () {
  const h = selectedMemberHome.value
  if (!h) return
  form.value.startAddress = h.address
  form.value.startCity = h.city
  form.value.startState = h.state
  form.value.startZip = h.zip
  form.value.startPhone = h.phone
}

function applyMemberHomeToDestination () {
  const h = selectedMemberHome.value
  if (!h) return
  form.value.address = h.address
  form.value.city = h.city
  form.value.state = h.state
  form.value.zip = h.zip
  form.value.phone = h.phone
}

function clearStart () {
  form.value.startAddress = ''
  form.value.startCity = ''
  form.value.startState = ''
  form.value.startZip = ''
  form.value.startPhone = ''
}

function clearDestination () {
  form.value.address = ''
  form.value.city = ''
  form.value.state = ''
  form.value.zip = ''
  form.value.phone = ''
}

const startIsEmpty = computed(() =>
  !form.value.startAddress && !form.value.startCity &&
  !form.value.startState && !form.value.startZip && !form.value.startPhone)

const filterMembers = (event) => {
  const query = event.query.toLowerCase()
  memberFilteredOptions.value = allMemberOptions.value.filter(m =>
    m.label.toLowerCase().includes(query)
  )
}

const filterVolunteers = (event) => {
  const query = event.query.toLowerCase()
  volunteerFilteredOptions.value = allVolunteerOptions.value.filter(v =>
    v.label.toLowerCase().includes(query)
  )
}

watch(selectedMember, (val) => {
  // Only update if it's a complete selected object with both label and value
  if (val && typeof val === 'object' && val.label && val.value) {
    form.value.memberPersonId = String(val.value)
    // Fetch the member's home and auto-fill Start only when Start is empty,
    // so an edit-load's saved Start values are never clobbered.
    loadMemberHome(val.value).then(() => {
      if (startIsEmpty.value) applyMemberHomeToStart()
    })
  } else {
    form.value.memberPersonId = null
    selectedMemberHome.value = null
  }
})

watch(selectedVolunteer, (val) => {
  // Only update if it's a complete selected object with both label and value
  if (val && typeof val === 'object' && val.label && val.value) {
    form.value.volunteerPersonId = String(val.value)
  } else {
    form.value.volunteerPersonId = null
  }
})

watch(() => form.value.villageId, (villageId, oldVillageId) => {
  // Clear member/volunteer when switching from one village to another.
  // Skip on initial population (oldVillageId is empty), so edit-loads keep their values.
  if (oldVillageId && villageId !== oldVillageId) {
    selectedMember.value = null
    selectedVolunteer.value = null
    form.value.memberPersonId = null
    form.value.volunteerPersonId = null
  }
  if (villageId) {
    fetchMembers()
    fetchVolunteers()
  }
})

watch(anyVillageVolunteers, () => {
  if (form.value.villageId) fetchVolunteers()
})

watch([allMemberOptions, () => form.value.memberPersonId], ([members, memberId]) => {
  if (members.length > 0 && memberId) {
    const matching = members.find(m => m.value === String(memberId))
    if (matching) {
      selectedMember.value = matching
    }
  }
})

watch([allVolunteerOptions, () => form.value.volunteerPersonId], ([volunteers, volunteerId]) => {
  if (volunteers.length > 0 && volunteerId) {
    const matching = volunteers.find(v => v.value === String(volunteerId))
    if (matching) {
      selectedVolunteer.value = matching
    }
  }
})

const statusOverride = ref(null)

const CLIENT_STATUSES = ['Draft', 'Completed', 'Member cancelled', 'Volunteer cancelled', 'Hub cancelled']

const computedStatus = computed(() => {
  if (statusOverride.value) return statusOverride.value
  if (isDraft.value) return 'Draft'
  if (CLIENT_STATUSES.includes(form.value.status) && form.value.status !== 'Draft') return form.value.status
  return form.value.volunteerPersonId ? 'Confirmed' : 'Open'
})

const createdByDisplayName = computed(() => existingRequest.value?.createdByDisplayName || '')

const formattedCreatedAt = computed(() => {
  if (!form.value.createdAt) return ''
  const d = new Date(form.value.createdAt)
  if (isNaN(d)) return ''
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
})


const serviceNameOptions = [
  'Ride: Medical Appnt',
  'Ride: Shopping',
  'Ride: Activity/Event',
  'Ride: Personal Care',
  'Ride: Other',
  'Tech Support',
  'Household Chores/Handy Help',
  'Errand: Shopping',
  'Errand: Pick up/delivery',
  'Errand: Other'
]

const transportationTypeOptions = [
  'Round Trip',
  'One Way',
  'None'
]

const stateOptions = [
  'RI',
  'CT',
  'MA'
]

// Times are stored as minutes-since-midnight (0..1425) so the Select value
// always reflects the chosen slot and is trivial to seed/convert.
const minutesToLabel = (mins) => {
  const h24 = Math.floor(mins / 60)
  const m = mins % 60
  const period = h24 < 12 ? 'AM' : 'PM'
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h12}:${String(m).padStart(2, '0')} ${period}`
}

const timeSlotOptions = []
for (let mins = 0; mins < 24 * 60; mins += 15) {
  timeSlotOptions.push({ label: minutesToLabel(mins), value: mins })
}

// Each later time field may only select a slot after the field before it, but
// the field's own current value is always included so an existing/loaded value
// renders even if it would otherwise be filtered out (e.g. on edit).
const slotsAfter = (after, current) => {
  if (after == null) return timeSlotOptions
  return timeSlotOptions.filter(o => o.value > after || o.value === current)
}

// The 15-minute grid is a data-entry aid, not a storage constraint: legacy
// or imported rows can hold off-grid minutes (e.g. 577 = '9:37 AM'). A
// Select only displays a value that matches an option by value equality, so
// without this an off-grid current value renders blank despite being set.
// Insert it in time order so the dropdown stays scannable.
const withCurrentValue = (options, current) => {
  if (current == null || options.some(o => o.value === current)) return options
  const injected = { label: minutesToLabel(current), value: current }
  const idx = options.findIndex(o => o.value > current)
  return idx === -1
    ? [...options, injected]
    : [...options.slice(0, idx), injected, ...options.slice(idx)]
}

const START_OF_DAY = 7 * 60 // 7:00 AM — open position for start time dropdown
const startOptions = computed(() => withCurrentValue([
  ...timeSlotOptions.filter(o => o.value >= START_OF_DAY),
  ...timeSlotOptions.filter(o => o.value < START_OF_DAY)
], form.value.startTime))
const apptOptions = computed(() => withCurrentValue(slotsAfter(form.value.startTime, form.value.apptTime), form.value.apptTime))
const returnOptions = computed(() => withCurrentValue(slotsAfter(form.value.apptTime, form.value.returnTime), form.value.returnTime))
const finishOptions = computed(() =>
  withCurrentValue(
    slotsAfter(
      form.value.transportationType === 'Round Trip'
        ? form.value.returnTime
        : form.value.startTime,
      form.value.finishTime
    ),
    form.value.finishTime
  )
)

// When an earlier time field changes, it narrows the option list of later
// fields (see slotsAfter above). If a later field's current value falls
// outside its new option list, clear it rather than leaving a selected value
// that's no longer valid. This never writes a new value into another field —
// only clears ones that became invalid. Clearing the earlier field itself
// (val == null) also clears its dependent, since slotsAfter(null, ...)
// otherwise treats "no earlier value" as "nothing is filtered out".
const clearIfInvalid = (field, upstreamVal, options) => {
  const val = form.value[field]
  if (val == null) return
  if (upstreamVal == null || !options.some(o => o.value === val)) form.value[field] = null
}

watch(() => form.value.startTime, (val) => {
  if (!formLoaded.value) return
  clearIfInvalid('apptTime', val, apptOptions.value)
}, { flush: 'sync' })

watch(() => form.value.apptTime, (val) => {
  if (!formLoaded.value) return
  clearIfInvalid('returnTime', val, returnOptions.value)
}, { flush: 'sync' })

watch([() => form.value.returnTime, () => form.value.startTime, () => form.value.transportationType], ([returnVal, startVal, transportationType]) => {
  if (!formLoaded.value) return
  const upstreamVal = transportationType === 'Round Trip' ? returnVal : startVal
  clearIfInvalid('finishTime', upstreamVal, finishOptions.value)
}, { flush: 'sync' })

watch(() => form.value.timesFlexible, (flex) => {
  if (!formLoaded.value || !flex) return
  form.value.startTime = null
  form.value.apptTime = null
  form.value.returnTime = null
  form.value.finishTime = null
})

const isRideService = computed(() => form.value.serviceName?.startsWith('Ride:'))

const noLocationServices = ['Tech Support', 'Household Chores/Handy Help']

const showLocationFields = computed(() => {
  if (!form.value.serviceName) return false
  return !noLocationServices.includes(form.value.serviceName)
})

const availableTransportationTypes = computed(() => {
  return isRideService.value ? ['Round Trip', 'One Way'] : ['None']
})

const isFormValid = computed(() => {
  const f = form.value

  if (!f.villageId) return false

  // Draft only requires a village
  if (isDraft.value) return true

  if (!f.serviceName || !f.memberPersonId || !f.serviceDate) return false

  // Ride-specific requirements
  if (isRideService.value) {
    if (!f.destination) return false
    if (!['Round Trip', 'One Way'].includes(f.transportationType)) return false
  }

  return true
})

// Same pairwise relationships slotsAfter uses to filter each field's option
// list, re-checked at submit time by handleSubmit (not gated here in
// isFormValid, since a disabled Save button can't be clicked to explain
// itself). clearIfInvalid (above) only runs once the form is loaded, so a
// request edited from stored data with an already inconsistent time
// sequence (e.g. written before this validation existed, or imported) can
// render without being auto-cleared — this is what handleSubmit catches.
const timesInOrder = computed(() => {
  const f = form.value
  if (f.apptTime != null && f.startTime != null && f.apptTime <= f.startTime) return false
  if (f.returnTime != null && f.apptTime != null && f.returnTime <= f.apptTime) return false
  const finishAfter = f.transportationType === 'Round Trip' ? f.returnTime : f.startTime
  if (f.finishTime != null && finishAfter != null && f.finishTime <= finishAfter) return false
  return true
})

// After creating a request, clear the form for another entry but keep the
// chosen village so consecutive requests for the same village are quick.
const resetForNewRequest = () => {
  const keepVillage = form.value.villageId
  isDraft.value = false
  selectedMember.value = null
  selectedVolunteer.value = null
  form.value = {
    villageId: keepVillage,
    memberPersonId: '',
    volunteerPersonId: '',
    status: '',
    serviceName: '',
    transportationType: '',
    createdAt: '',
    serviceDate: '',
    timesFlexible: false,
    startTime: null,
    finishTime: null,
    apptTime: null,
    returnTime: null,
    state: '',
    city: '',
    zip: '',
    address: '',
    phone: '',
    startAddress: '',
    startCity: '',
    startState: '',
    startZip: '',
    startPhone: '',
    instructions: '',
    description: '',
    destination: ''
  }
}

watch(isRideService, (newIsRide) => {
  if (!formLoaded.value) return
  if (newIsRide) {
    form.value.transportationType = 'Round Trip'
  } else {
    form.value.transportationType = 'None'
  }
})

const handleSubmit = async (notify = false) => {
  try {
    if (!form.value.villageId) {
      toast.add({ severity: 'error', summary: 'Error', detail: 'Village is required', life: 3000 })
      return
    }

    if (!isDraft.value) {
      if (!form.value.serviceName) {
        toast.add({ severity: 'error', summary: 'Error', detail: 'Service name is required', life: 3000 })
        return
      }
      if (!form.value.memberPersonId) {
        toast.add({ severity: 'error', summary: 'Error', detail: 'Member is required', life: 3000 })
        return
      }
      if (!form.value.serviceDate) {
        toast.add({ severity: 'error', summary: 'Error', detail: 'Service date is required', life: 3000 })
        return
      }

      if (isRideService.value) {
        if (!form.value.destination) {
          toast.add({ severity: 'error', summary: 'Error', detail: 'Destination is required for ride services', life: 3000 })
          return
        }
        if (!form.value.transportationType || !['Round Trip', 'One Way'].includes(form.value.transportationType)) {
          toast.add({ severity: 'error', summary: 'Error', detail: 'Transportation type is required for ride services', life: 3000 })
          return
        }

        if (!form.value.timesFlexible) {
          const requiredTimes = form.value.transportationType === 'Round Trip'
            ? [form.value.startTime, form.value.apptTime, form.value.returnTime, form.value.finishTime]
            : [form.value.startTime, form.value.finishTime]
          if (requiredTimes.some((t) => t == null)) {
            toast.add({ severity: 'error', summary: 'Error', detail: `Enter all times for ${form.value.transportationType}, or check "Times flexible"`, life: 3000 })
            return
          }
        }
      }

      if (!form.value.timesFlexible && !timesInOrder.value) {
        const f = form.value
        if (f.apptTime != null && f.startTime != null && f.apptTime <= f.startTime) {
          toast.add({ severity: 'error', summary: 'Error', detail: 'Arrival time must be after Start time', life: 3000 })
        } else if (f.returnTime != null && f.apptTime != null && f.returnTime <= f.apptTime) {
          toast.add({ severity: 'error', summary: 'Error', detail: 'Return time must be after Arrival time', life: 3000 })
        } else {
          const finishAfterLabel = f.transportationType === 'Round Trip' ? 'Return' : 'Start'
          toast.add({ severity: 'error', summary: 'Error', detail: `Finish time must be after ${finishAfterLabel} time`, life: 3000 })
        }
        return
      }
    }

    isSubmitting.value = true

    const payload = {
      villageId: form.value.villageId,
      memberPersonId: form.value.memberPersonId?.trim() || null,
      volunteerPersonId: form.value.volunteerPersonId?.trim() || null,
      notify,
      serviceName: form.value.serviceName || null,
      transportationType: form.value.transportationType || null,
      serviceDate: dateToServiceDate(form.value.serviceDate),
      timesFlexible: isRideService.value ? form.value.timesFlexible : true,
      startTime: form.value.timesFlexible ? null : minutesToTimeString(form.value.startTime),
      finishTime: form.value.timesFlexible ? null : minutesToTimeString(form.value.finishTime),
      apptTime: (!form.value.timesFlexible && isRideService.value && form.value.transportationType === 'Round Trip')
        ? minutesToTimeString(form.value.apptTime) : null,
      returnTime: (!form.value.timesFlexible && isRideService.value && form.value.transportationType === 'Round Trip')
        ? minutesToTimeString(form.value.returnTime) : null,
      state: form.value.state || null,
      city: form.value.city || null,
      zip: form.value.zip || null,
      address: form.value.address || null,
      phone: form.value.phone || null,
      startAddress: form.value.startAddress || null,
      startCity: form.value.startCity || null,
      startState: form.value.startState || null,
      startZip: form.value.startZip || null,
      startPhone: form.value.startPhone || null,
      instructions: form.value.instructions || null,
      description: form.value.description || null,
      destination: form.value.destination || null
    }

    if (isDraft.value) {
      payload.status = 'Draft'
    } else if (isEdit.value) {
      // Only send status on PATCH for non-derived client values.
      // Draft is excluded here because isDraft.value is false in this branch.
      const nonDraftClientStatuses = CLIENT_STATUSES.filter(s => s !== 'Draft')
      if (nonDraftClientStatuses.includes(form.value.status)) {
        payload.status = form.value.status
      }
    }

    let result
    if (isEdit.value) {
      result = await apiCall('patchServiceRequest', { serviceRequestId: serviceRequestId.value }, payload)
    } else {
      result = await apiCall('createServiceRequest', {}, payload)
    }

    const displayId = result.requestNumber ?? result.serviceRequestId
    toast.add({
      severity: 'success',
      summary: 'Success',
      detail: isEdit.value ? `Service request #${displayId} updated` : `Service request #${displayId} created`,
      life: 3000
    })

    if (isEdit.value) {
      setTimeout(() => {
        setPendingHighlight(serviceRequestId.value)
        router.push({ name: 'meta-service-requests' })
      }, 500)
    } else {
      // Stay on the form, ready for another new request (keep the village).
      resetForNewRequest()
    }
  } catch (err) {
    // Privacy-ack gate already handled globally (ack modal opens); skip the
    // misleading "failed" toast for a request that was intercepted, not failed.
    if (isPrivacyAckError(err)) return
    console.error(err)
    toast.add({
      severity: 'error',
      summary: 'Error',
      detail: isEdit.value ? 'Failed to update service request' : 'Failed to create service request',
      life: 5000
    })
  } finally {
    isSubmitting.value = false
  }
}

const isPublishing = computed(() => isEdit.value && wasLoadedAsDraft.value && !isDraft.value)

const splitButtonModel = computed(() => {
  return [{ label: 'Save and Notify', icon: 'pi pi-envelope', command: () => handleSubmit(true) }]
})

const handleCancel = () => {
  if (isEdit.value) setPendingHighlight(serviceRequestId.value)
  router.push({ name: 'meta-service-requests' })
}

const CANCEL_REASONS = ['Member cancelled', 'Volunteer cancelled', 'Hub cancelled']

const isCancelled = computed(() =>
  existingRequest.value?.status?.toLowerCase().includes('cancelled') ?? false
)

const isConfirmed = computed(() =>
  existingRequest.value?.status?.toLowerCase() === 'confirmed'
)

const isCompleting = ref(false)

const handleComplete = async () => {
  isCompleting.value = true
  statusOverride.value = 'Completed'
  try {
    await apiCall('patchServiceRequest', { serviceRequestId: serviceRequestId.value }, { status: 'Completed' })
    toast.add({ severity: 'success', summary: 'Success', detail: 'Service request marked as completed', life: 3000 })
    setTimeout(() => {
      setPendingHighlight(serviceRequestId.value)
      router.push({ name: 'meta-service-requests' })
    }, 500)
  } catch (err) {
    statusOverride.value = null
    if (isPrivacyAckError(err)) return
    console.error(err)
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to complete service request', life: 5000 })
  } finally {
    isCompleting.value = false
  }
}

const isDeleting = ref(false)

const handleDeleteDraft = async () => {
  isDeleting.value = true
  try {
    await apiCall('deleteServiceRequest', { serviceRequestId: serviceRequestId.value })
    toast.add({ severity: 'success', summary: 'Success', detail: 'Draft deleted', life: 3000 })
    setTimeout(() => {
      setPendingHighlight(serviceRequestId.value)
      router.push({ name: 'meta-service-requests' })
    }, 500)
  } catch (err) {
    if (isPrivacyAckError(err)) return
    console.error(err)
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to delete draft', life: 5000 })
  } finally {
    isDeleting.value = false
  }
}

const doCancelRequest = async (reason, notify) => {
  isCancelling.value = true
  try {
    await apiCall('patchServiceRequest', { serviceRequestId: serviceRequestId.value }, { status: reason, notify })
    toast.add({ severity: 'success', summary: 'Success', detail: 'Service request cancelled', life: 3000 })
    setTimeout(() => {
      setPendingHighlight(serviceRequestId.value)
      router.push({ name: 'meta-service-requests' })
    }, 500)
  } catch (err) {
    if (isPrivacyAckError(err)) return
    console.error(err)
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to cancel service request', life: 5000 })
  } finally {
    isCancelling.value = false
  }
}

const handleCancelRequest = (reason) => {
  cancelPopover.value.hide()
  confirm.require({
    header: 'Cancel Service Request',
    message: 'Should notifications be sent for this cancellation?',
    acceptLabel: 'Cancel and Notify',
    rejectLabel: 'Cancel without Notification',
    acceptProps: { severity: 'danger' },
    rejectProps: { severity: 'danger' },
    accept: () => doCancelRequest(reason, true),
    reject: () => doCancelRequest(reason, false)
  })
}

const personDialogVisible = ref(false)
const personDialogPersonId = ref(null)

const openPersonDialog = (personId) => {
  personDialogPersonId.value = personId
  personDialogVisible.value = true
}

</script>

<template>
  <div class="service-request-create-edit">
    <Card class="form-card">
      <template #header>
        <div class="card-header-wrapper">
          <div class="header-left">
            <div class="title-row">
              <h2 class="card-title">{{ isEdit ? `Edit Service Request (#${existingRequest?.requestNumber ?? serviceRequestId})` : 'Create Service Request' }}</h2>
            </div>
            <div v-if="formattedCreatedAt" class="card-subtitle">Created {{ formattedCreatedAt }}<template v-if="createdByDisplayName"> by {{ createdByDisplayName }}</template></div>
          </div>
          <div class="header-right">
            <Tag
              v-if="!isEdit || !isLoadingRequest"
              :value="computedStatus"
              :severity="
                computedStatus === 'Confirmed' ? 'info'
                : computedStatus === 'Completed' ? 'success'
                : computedStatus === 'Draft' ? 'secondary'
                : computedStatus.includes('cancelled') ? 'danger'
                : 'warn'
              "
            />
            <Button
              v-if="isEdit && isConfirmed"
              type="button"
              label="Set Completed"
              :loading="isCompleting"
              :disabled="isCompleting"
              @click="handleComplete"
            />
          </div>
        </div>
      </template>

      <template #content>
        <div v-if="isLoadingRequest && isEdit" class="loading">Loading...</div>

        <form v-if="!isLoadingRequest || !isEdit" class="form" style="display: flex; flex-direction: column; gap: 1.5rem;" @submit.prevent="handleSubmit">
          <!-- Persons Section -->
          <div style="border-bottom: 2px solid var(--color-border-default); margin-bottom: 0.5rem; padding-bottom: 0.75rem;">
            <h3 style="margin: 0; font-size: 0.95rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--p-primary-600);">Persons</h3>
          </div>

          <!-- Persons Controls -->
          <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1rem;">
            <div>
              <label style="display: block; font-weight: 500; margin-bottom: 0.5rem;">Village<span class="req">*</span></label>
              <Select
                v-model="form.villageId"
                :options="villageOptions"
                option-label="label"
                option-value="value"
                placeholder="Select a village"
                style="max-width: 16rem;"
              />
            </div>

            <div v-if="form.villageId">
              <label style="display: block; font-weight: 500; margin-bottom: 0.5rem;">Member<span class="req">*</span></label>
              <div class="person-field-row">
                <AutoComplete
                  v-model="selectedMember"
                  :suggestions="memberFilteredOptions"
                  option-label="label"
                  placeholder="Search member"
                  :force-selection="true"
                  showClear
                  @complete="filterMembers"
                />
                <Button
                  v-if="form.memberPersonId"
                  type="button"
                  icon="pi pi-id-card"
                  text
                  rounded
                  severity="secondary"
                  aria-label="View member details"
                  v-tooltip.top="'View member details'"
                  @click="openPersonDialog(form.memberPersonId)"
                />
              </div>
            </div>

            <div v-if="form.villageId">
              <label class="volunteer-label">
                <span>Volunteer</span>
                <span class="any-village-toggle">
                  <Checkbox v-model="anyVillageVolunteers" binary input-id="any-village-volunteers" />
                  <label for="any-village-volunteers">From any village</label>
                </span>
              </label>
              <div class="person-field-row">
                <AutoComplete
                  v-model="selectedVolunteer"
                  :suggestions="volunteerFilteredOptions"
                  option-label="label"
                  placeholder="Search volunteer"
                  :force-selection="true"
                  showClear
                  @complete="filterVolunteers"
                />
                <Button
                  v-if="form.volunteerPersonId"
                  type="button"
                  icon="pi pi-id-card"
                  text
                  rounded
                  severity="secondary"
                  aria-label="View volunteer details"
                  v-tooltip.top="'View volunteer details'"
                  @click="openPersonDialog(form.volunteerPersonId)"
                />
              </div>
            </div>
          </div>

          <!-- Hint shown until a village is selected -->
          <div v-if="!form.villageId" class="village-hint">
            Select a village to continue…
          </div>

          <!-- Hint shown once village is selected but before a member is chosen -->
          <div v-if="form.villageId && !form.memberPersonId" class="village-hint">
            Select a member to continue…
          </div>

          <!-- Remaining sections, revealed once a member is chosen -->
          <template v-if="form.villageId && form.memberPersonId">

          <!-- Service Notes: display-only, sourced from the selected member's record -->
          <div style="border-bottom: 2px solid var(--color-border-default); margin-bottom: 0.5rem; padding-bottom: 0.75rem;">
            <h3 style="margin: 0; font-size: 0.95rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--p-primary-600);">Service Notes</h3>
          </div>
          <div v-if="selectedMemberServiceNotes" style="white-space: pre-wrap;">{{ selectedMemberServiceNotes }}</div>
          <div v-else class="service-notes-empty">There are no service notes for this member</div>

          <!-- Service Section -->
          <div style="border-bottom: 2px solid var(--color-border-default); margin-bottom: 0.5rem; padding-bottom: 0.75rem;">
            <h3 style="margin: 0; font-size: 0.95rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--p-primary-600);">Service</h3>
          </div>

          <!-- Service Controls -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
            <div>
              <label style="display: block; font-weight: 500; margin-bottom: 0.5rem;">Service Name<span class="req">*</span></label>
              <Select
                v-model="form.serviceName"
                :options="serviceNameOptions.map(s => ({ label: s, value: s }))"
                option-label="label"
                option-value="value"
                placeholder="Select service"
              />
            </div>

            <div v-if="isRideService">
              <label style="display: block; font-weight: 500; margin-bottom: 0.5rem;">Transportation Type<span class="req">*</span></label>
              <Select
                v-model="form.transportationType"
                :options="availableTransportationTypes.map(t => ({ label: t, value: t }))"
                option-label="label"
                option-value="value"
                placeholder="Select type"
              />
            </div>

            <div style="grid-column: 1 / -1;">
              <label style="display: block; font-weight: 500; margin-bottom: 0.5rem;">Description</label>
              <Textarea
                v-model="form.description"
                placeholder="Enter description"
                rows="3"
                style="width: 100%; resize: none;"
              />
            </div>
          </div>

          <!-- Date & Time Section -->
          <div style="border-bottom: 2px solid var(--color-border-default); margin-bottom: 0.5rem; padding-bottom: 0.75rem;">
            <h3 style="margin: 0; font-size: 0.95rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--p-primary-600);">Date &amp; Time</h3>
          </div>

          <!-- Date Row -->
          <div style="display: flex; align-items: flex-end; gap: 1.5rem;">
            <div>
              <label style="display: block; font-weight: 500; margin-bottom: 0.5rem;">Date<span class="req">*</span></label>
              <DatePicker
                v-model="form.serviceDate"
                dateFormat="mm/dd/yy"
                placeholder="Select date"
                style="max-width: 16rem;"
              />
            </div>

            <div v-if="isRideService" style="display: flex; align-items: center; gap: 0.5rem; height: 2.5rem;">
              <Checkbox v-model="form.timesFlexible" input-id="timesFlexible" binary />
              <label for="timesFlexible">Times flexible</label>
            </div>
          </div>

          <!-- Time Row -->
          <div
            v-if="isRideService && !form.timesFlexible"
            style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem;"
          >
            <div>
              <label style="display: block; font-weight: 500; margin-bottom: 0.5rem;">Start</label>
              <Select
                v-model="form.startTime"
                :options="startOptions"
                option-label="label"
                option-value="value"
                placeholder="Start time"
                show-clear
                style="width: 100%;"
              />
            </div>

            <div v-if="form.transportationType === 'Round Trip'">
              <label style="display: block; font-weight: 500; margin-bottom: 0.5rem;">Arrive</label>
              <Select
                v-model="form.apptTime"
                :options="apptOptions"
                option-label="label"
                option-value="value"
                placeholder="Arrival time"
                show-clear
                style="width: 100%;"
              />
            </div>

            <div v-if="form.transportationType === 'Round Trip'">
              <label style="display: block; font-weight: 500; margin-bottom: 0.5rem;">Return</label>
              <Select
                v-model="form.returnTime"
                :options="returnOptions"
                option-label="label"
                option-value="value"
                placeholder="Return time"
                show-clear
                style="width: 100%;"
              />
            </div>

            <div>
              <label style="display: block; font-weight: 500; margin-bottom: 0.5rem;">Finish</label>
              <Select
                v-model="form.finishTime"
                :options="finishOptions"
                option-label="label"
                option-value="value"
                placeholder="Finish time"
                show-clear
                style="width: 100%;"
              />
            </div>
          </div>

          <!-- Destination Section -->
          <template v-if="showLocationFields">
            <div style="border-bottom: 2px solid var(--color-border-default); margin-bottom: 0.5rem; padding-bottom: 0.75rem;">
              <h3 style="margin: 0; font-size: 0.95rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--p-primary-600);">Destination</h3>
            </div>

            <!-- Destination / Address Row -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
              <div>
                <label style="display: block; font-weight: 500; margin-bottom: 0.5rem;">Destination<span v-if="isRideService" class="req">*</span></label>
                <InputText
                  v-model="form.destination"
                  placeholder="Enter destination"
                  style="width: 100%;"
                />
              </div>

              <div>
                <label style="display: block; font-weight: 500; margin-bottom: 0.5rem;">Address</label>
                <InputText
                  v-model="form.address"
                  placeholder="Enter address"
                  style="width: 100%;"
                />
              </div>
            </div>

            <!-- City / State / Zip / Phone Row -->
            <div style="display: grid; grid-template-columns: 2fr 1fr 1fr 1.5fr; gap: 1rem;">
              <div>
                <label style="display: block; font-weight: 500; margin-bottom: 0.5rem;">City</label>
                <InputText
                  v-model="form.city"
                  placeholder="City"
                  style="width: 100%;"
                />
              </div>

              <div>
                <label style="display: block; font-weight: 500; margin-bottom: 0.5rem;">State</label>
                <Select
                  v-model="form.state"
                  :options="stateOptions.map(s => ({ label: s, value: s }))"
                  option-label="label"
                  option-value="value"
                  placeholder="State"
                  style="width: 100%;"
                />
              </div>

              <div>
                <label style="display: block; font-weight: 500; margin-bottom: 0.5rem;">Zip</label>
                <InputText
                  v-model="form.zip"
                  placeholder="Zip"
                  style="width: 100%;"
                />
              </div>

              <div>
                <label style="display: block; font-weight: 500; margin-bottom: 0.5rem;">Phone</label>
                <InputText
                  v-model="form.phone"
                  placeholder="Phone"
                  style="width: 100%;"
                />
              </div>
            </div>
          </template>

          </template>

          <!-- Actions -->
          <div class="form-actions">
            <template v-if="isEdit">
              <Button
                v-if="wasLoadedAsDraft"
                type="button"
                label="Delete Draft"
                severity="danger"
                :loading="isDeleting"
                :disabled="isSubmitting || isDeleting"
                @click="handleDeleteDraft"
              />
              <template v-else>
                <Button
                  type="button"
                  label="Cancel Request"
                  severity="danger"
                  :disabled="isSubmitting || isCancelling || isCancelled"
                  @click="(e) => cancelPopover.toggle(e)"
                />
                <Popover ref="cancelPopover">
                  <div style="display: flex; flex-direction: column; gap: 0.25rem; min-width: 180px;">
                    <Button
                      v-for="reason in CANCEL_REASONS"
                      :key="reason"
                      :label="reason"
                      text
                      severity="danger"
                      style="justify-content: flex-start;"
                      @click="handleCancelRequest(reason)"
                    />
                  </div>
                </Popover>
              </template>
            </template>
            <div class="form-actions-right">
              <Button
                type="button"
                label="Close"
                severity="secondary"
                @click="handleCancel"
                :disabled="isSubmitting"
              />
              <Button
                v-if="isDraft"
                type="button"
                label="Save Draft"
                :loading="isSubmitting"
                :disabled="!isFormValid || isSubmitting"
                @click="handleSubmit(false)"
              />
              <SplitButton
                v-else
                label="Save"
                icon="pi pi-upload"
                :loading="isSubmitting"
                :disabled="!isFormValid || isSubmitting"
                :model="splitButtonModel"
                @click="handleSubmit(false)"
              />
            </div>
          </div>
        </form>
      </template>
    </Card>
    <PersonDetailDialog
      v-model:visible="personDialogVisible"
      :person-id="personDialogPersonId"
    />
  </div>
</template>

<style scoped>
.service-request-create-edit {
  padding: 2rem;
  max-width: 1000px;
  margin: 0 auto;
}

.form-card {
  width: 100%;
}

.village-hint {
  color: var(--color-text-dim);
  font-style: italic;
  font-size: 0.9rem;
}

.service-notes-empty {
  color: var(--color-text-dim);
  font-style: italic;
}

.req {
  color: var(--color-error);
  margin-left: 0.15rem;
}

.person-field-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.volunteer-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-weight: 500;
  margin-bottom: 0.5rem;
}

.any-village-toggle {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-weight: 400;
  font-size: 0.85rem;
  color: var(--color-text-dim);
}

.any-village-toggle label {
  cursor: pointer;
}

.card-header-wrapper {
  padding: 1rem;
  border-bottom: 1px solid var(--color-border-default);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-title {
  margin: 0;
  color: var(--color-text-primary);
}

.card-subtitle {
  margin-top: 0.25rem;
  font-size: 0.85rem;
  color: var(--color-text-dim);
}

.header-right {
  display: flex;
  align-items: center;
  gap: 1.75rem;
}

.draft-toggle {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.form {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.form-label {
  font-weight: 500;
  color: var(--color-text-primary);
  font-size: 0.95rem;
}

.form-label.required::after {
  content: ' *';
  color: var(--color-error);
}

.form-section {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 0 0 1rem 0;
}

.section-header {
  grid-column: 1 / -1;
  margin: 0 0 0.75rem 0;
  font-size: 0.95rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--p-primary-600);
  border-bottom: 2px solid var(--color-border-default);
  padding-bottom: 0.75rem;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

.form-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 1rem;
  border-top: 1px solid var(--color-border-default);
}

.form-actions-right {
  display: flex;
  gap: 1rem;
  margin-left: auto;
}

.loading {
  padding: 2rem;
  text-align: center;
  color: var(--color-text-dim);
}

.status-display {
  padding: 0.5rem 0.75rem;
  background-color: var(--color-background-secondary);
  border: 1px solid var(--color-border-default);
  border-radius: 4px;
  color: var(--color-text-primary);
  font-size: 0.95rem;
}

@media (max-width: 768px) {
  .service-request-create-edit {
    padding: 1rem;
  }

  .form-row {
    grid-template-columns: 1fr;
  }

  .form-actions {
    flex-direction: column;
  }

  .form-actions button {
    width: 100%;
  }
}
</style>
