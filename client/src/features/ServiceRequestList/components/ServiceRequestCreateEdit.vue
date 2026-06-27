<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import Card from 'primevue/card'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Textarea from 'primevue/textarea'
import DatePicker from 'primevue/datepicker'
import Select from 'primevue/select'
import AutoComplete from 'primevue/autocomplete'
import Tag from 'primevue/tag'
import Popover from 'primevue/popover'
import { useAsyncState } from '../../../shared/composables/useAsyncState.js'
import { apiCall } from '../../../shared/api/apiClient.js'
import { getServiceRequest } from '../api/serviceRequestApi.js'
import { getVillages } from '../../VillageList/api/villageApi.js'
import { getVillageMembers } from '../../MemberList/api/memberApi.js'
import { getVillageVolunteers } from '../../VolunteerList/api/volunteerApi.js'

defineOptions({ name: 'ServiceRequestCreateEdit' })

const router = useRouter()
const route = useRoute()
const toast = useToast()

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

const { state: villageVolunteers, execute: fetchVolunteers } = useAsyncState(
  () => form.value.villageId ? getVillageVolunteers(form.value.villageId) : null,
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
  startTime: null,
  finishTime: null,
  apptTime: null,
  returnTime: null,
  state: '',
  city: '',
  zip: '',
  address: '',
  phone: '',
  instructions: '',
  description: '',
  destination: ''
})

const isSubmitting = ref(false)
const isCancelling = ref(false)
const cancelPopover = ref(null)

// False while the existingRequest watcher is populating the form, so the
// isRideService watcher does not overwrite the API's transportationType.
// Starts true in create mode (no load needed); starts false in edit mode.
const formLoaded = ref(!isEdit.value)

watch(existingRequest, async (val) => {
  if (val && isEdit.value) {
    formLoaded.value = false
    const extractTimeAsMinutes = (dateStr) => {
      if (!dateStr) return null
      const date = new Date(dateStr)
      const raw = date.getHours() * 60 + date.getMinutes()
      // Snap to the nearest 15-minute slot so it matches a Select option.
      return Math.round(raw / 15) * 15
    }
    const extractDate = (dateStr) => {
      if (!dateStr) return ''
      return new Date(dateStr)
    }
    form.value = {
      villageId: val.villageId || '',
      memberPersonId: val.memberPersonId || '',
      volunteerPersonId: val.volunteerPersonId || '',
      status: val.status || '',
      serviceName: val.serviceName || '',
      transportationType: val.transportationType || '',
      createdAt: extractDate(val.createdAt),
      serviceDate: extractDate(val.startAt),
      startTime: extractTimeAsMinutes(val.startAt),
      finishTime: extractTimeAsMinutes(val.finishAt),
      apptTime: extractTimeAsMinutes(val.apptTime),
      returnTime: extractTimeAsMinutes(val.returnTime),
      state: val.state || '',
      city: val.city || '',
      zip: val.zip || '',
      address: val.address || '',
      phone: val.phone || '',
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
  } else {
    form.value.memberPersonId = null
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

const computedStatus = computed(() => {
  if (statusOverride.value) return statusOverride.value
  return form.value.volunteerPersonId ? 'Confirmed' : 'Open'
})

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

watch(() => form.value.volunteerPersonId, () => {
  form.value.status = computedStatus.value
}, { immediate: true })

// When the user changes a time field, cascade forward to the next field,
// setting it to val + 15 minutes. The full chain propagates:
// Round Trip: Start -> Appointment -> Return -> Finish.
// One Way:    Start -> Finish (Appointment/Return are hidden).
const seedNext = (field, val) => {
  form.value[field] = Math.min(val + 15, 23 * 60 + 45)
}

watch(() => form.value.startTime, (val) => {
  if (val == null) return
  seedNext(form.value.transportationType === 'Round Trip' ? 'apptTime' : 'finishTime', val)
}, { flush: 'sync' })

watch(() => form.value.apptTime, (val) => {
  if (val == null) return
  seedNext('returnTime', val)
}, { flush: 'sync' })

watch(() => form.value.returnTime, (val) => {
  if (val == null) return
  seedNext('finishTime', val)
}, { flush: 'sync' })

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
  'Member Added',
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

const startOptions = computed(() => timeSlotOptions)
const apptOptions = computed(() => slotsAfter(form.value.startTime, form.value.apptTime))
const returnOptions = computed(() => slotsAfter(form.value.apptTime, form.value.returnTime))
const finishOptions = computed(() =>
  slotsAfter(
    form.value.transportationType === 'Round Trip'
      ? form.value.returnTime
      : form.value.startTime,
    form.value.finishTime
  )
)

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

  // Always required
  if (!f.villageId || !f.serviceName || !f.memberPersonId || !f.serviceDate) {
    return false
  }

  // Ride-specific requirements. Time fields are optional; only the
  // destination and a valid transportation type are required.
  if (isRideService.value) {
    if (!f.destination) return false
    if (!['Round Trip', 'One Way'].includes(f.transportationType)) return false
  }

  return true
})

// After creating a request, clear the form for another entry but keep the
// chosen village so consecutive requests for the same village are quick.
const resetForNewRequest = () => {
  const keepVillage = form.value.villageId
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
    startTime: null,
    finishTime: null,
    apptTime: null,
    returnTime: null,
    state: '',
    city: '',
    zip: '',
    address: '',
    phone: '',
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

const handleSubmit = async () => {
  try {
    // Required fields
    if (!form.value.villageId) {
      toast.add({ severity: 'error', summary: 'Error', detail: 'Village is required', life: 3000 })
      return
    }
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

    // Ride-specific validation
    if (isRideService.value) {
      if (!form.value.destination) {
        toast.add({ severity: 'error', summary: 'Error', detail: 'Destination is required for ride services', life: 3000 })
        return
      }
      if (!form.value.transportationType || !['Round Trip', 'One Way'].includes(form.value.transportationType)) {
        toast.add({ severity: 'error', summary: 'Error', detail: 'Transportation type is required for ride services', life: 3000 })
        return
      }
      // Time fields are optional; no time validation is enforced.
    }

    isSubmitting.value = true

    const combineDateAndTime = (date, minutes) => {
      if (!date || minutes == null) return null
      const d = new Date(date)
      d.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0)
      return d.toISOString()
    }

    const getStartOfDay = (date) => {
      if (!date) return null
      const d = new Date(date)
      d.setHours(0, 0, 0, 0)
      return d.toISOString()
    }

    const getEndOfDay = (date) => {
      if (!date) return null
      const d = new Date(date)
      d.setHours(23, 59, 59, 999)
      return d.toISOString()
    }

    const payload = {
      villageId: form.value.villageId,
      memberPersonId: form.value.memberPersonId?.trim() || null,
      volunteerPersonId: form.value.volunteerPersonId?.trim() || null,
      // Always derive status from the current volunteer assignment so it can
      // never be null (the form watcher can miss reset/no-change cases).
      status: computedStatus.value,
      serviceName: form.value.serviceName || null,
      transportationType: form.value.transportationType || null,
      // The date must always be preserved, since there is no standalone date
      // column — start_at/finish_at carry it. When a specific time is given we
      // use it; otherwise we anchor to start-of-day / end-of-day (local → UTC)
      // so the chosen date is never lost. This holds for all service types:
      // non-ride requests have no times and always anchor to the full day, and
      // rides with optional/missing times fall back to the same anchors.
      // TODO: post-CE, split the schema into a DATE column + nullable TIME
      // columns so the date is no longer overloaded onto start_at/finish_at.
      // That removes this anchoring, the local→UTC conversion, and the
      // 12:00 AM / 11:45 PM anchor artifacts on re-edit. Touches: migration
      // (backfill from start_at/finish_at; mind legacy CE rows), OAS schemas,
      // ServiceRequestService SQL + finish_at DESC ordering, and the client
      // (this builder, the edit read-back watcher, list "Date" column, detail).
      startAt: combineDateAndTime(form.value.serviceDate, form.value.startTime)
        ?? getStartOfDay(form.value.serviceDate),
      finishAt: combineDateAndTime(form.value.serviceDate, form.value.finishTime)
        ?? getEndOfDay(form.value.serviceDate),
      apptTime: isRideService.value && form.value.transportationType === 'Round Trip'
        ? combineDateAndTime(form.value.serviceDate, form.value.apptTime)
        : null,
      returnTime: isRideService.value && form.value.transportationType === 'Round Trip'
        ? combineDateAndTime(form.value.serviceDate, form.value.returnTime)
        : null,
      state: form.value.state || null,
      city: form.value.city || null,
      zip: form.value.zip || null,
      address: form.value.address || null,
      phone: form.value.phone || null,
      instructions: form.value.instructions || null,
      description: form.value.description || null,
      destination: form.value.destination || null
    }

    let result
    if (isEdit.value) {
      result = await apiCall('patchServiceRequest', { serviceRequestId: serviceRequestId.value }, payload)
    } else {
      result = await apiCall('createServiceRequest', {}, payload)
    }

    toast.add({
      severity: 'success',
      summary: 'Success',
      detail: isEdit.value ? 'Service request updated' : 'Service request created',
      life: 3000
    })

    if (isEdit.value) {
      setTimeout(() => {
        router.push({ name: 'meta-service-requests' })
      }, 500)
    } else {
      // Stay on the form, ready for another new request (keep the village).
      resetForNewRequest()
    }
  } catch (err) {
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

const handleCancel = () => {
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
      router.push({ name: 'meta-service-requests' })
    }, 500)
  } catch (err) {
    statusOverride.value = null
    console.error(err)
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to complete service request', life: 5000 })
  } finally {
    isCompleting.value = false
  }
}

const handleCancelRequest = async (reason) => {
  cancelPopover.value.hide()
  isCancelling.value = true
  try {
    await apiCall('patchServiceRequest', { serviceRequestId: serviceRequestId.value }, { status: reason })
    toast.add({ severity: 'success', summary: 'Success', detail: 'Service request cancelled', life: 3000 })
    setTimeout(() => {
      router.push({ name: 'meta-service-requests' })
    }, 500)
  } catch (err) {
    console.error(err)
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to cancel service request', life: 5000 })
  } finally {
    isCancelling.value = false
  }
}

const testValue = ref(null)
const testItems = ref([])
const testSearch = (event) => {
  testItems.value = ['Option 1', 'Option 2', 'Option 3']
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
            <div v-if="formattedCreatedAt" class="card-subtitle">Created {{ formattedCreatedAt }}</div>
          </div>
          <div class="header-right">
            <Tag
              v-if="!isEdit || !isLoadingRequest"
              :value="computedStatus"
              :severity="computedStatus === 'Confirmed' ? 'info' : computedStatus === 'Completed' ? 'success' : 'warn'"
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
              <AutoComplete
                v-model="selectedMember"
                :suggestions="memberFilteredOptions"
                option-label="label"
                placeholder="Search member"
                :force-selection="true"
                showClear
                @complete="filterMembers"
              />
            </div>

            <div v-if="form.villageId">
              <label style="display: block; font-weight: 500; margin-bottom: 0.5rem;">Volunteer</label>
              <AutoComplete
                v-model="selectedVolunteer"
                :suggestions="volunteerFilteredOptions"
                option-label="label"
                placeholder="Search volunteer"
                :force-selection="true"
                showClear
                @complete="filterVolunteers"
              />
            </div>
          </div>

          <!-- Hint shown until a village is selected -->
          <div v-if="!form.villageId" class="village-hint">
            Select a village to continue…
          </div>

          <!-- Remaining sections, revealed once a village is chosen -->
          <template v-if="form.villageId">

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

            <div>
              <label style="display: block; font-weight: 500; margin-bottom: 0.5rem;">Transportation Type<span v-if="isRideService" class="req">*</span></label>
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
          <div>
            <label style="display: block; font-weight: 500; margin-bottom: 0.5rem;">Date<span class="req">*</span></label>
            <DatePicker
              v-model="form.serviceDate"
              dateFormat="mm/dd/yy"
              placeholder="Select date"
              style="max-width: 16rem;"
            />
          </div>

          <!-- Time Row -->
          <div
            v-if="isRideService"
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
                filter
                style="width: 100%;"
              />
            </div>

            <div v-if="form.transportationType === 'Round Trip'">
              <label style="display: block; font-weight: 500; margin-bottom: 0.5rem;">Appointment</label>
              <Select
                v-model="form.apptTime"
                :options="apptOptions"
                option-label="label"
                option-value="value"
                placeholder="Appt time"
                filter
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
                filter
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
                filter
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
            <div class="form-actions-right">
              <Button
                type="button"
                label="Close"
                severity="secondary"
                @click="handleCancel"
                :disabled="isSubmitting"
              />
              <Button
                type="submit"
                :label="isEdit ? 'Update' : 'Create'"
                :loading="isSubmitting"
                :disabled="!isFormValid || isSubmitting"
              />
            </div>
          </div>
        </form>
      </template>
    </Card>
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

.req {
  color: var(--color-error);
  margin-left: 0.15rem;
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
  gap: 0.75rem;
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
