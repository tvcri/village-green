<script setup>
import { computed, ref, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import Card from 'primevue/card'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Textarea from 'primevue/textarea'
import Calendar from 'primevue/calendar'
import Select from 'primevue/select'
import AutoComplete from 'primevue/autocomplete'
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
  startTime: '',
  finishTime: '',
  apptTime: '',
  returnTime: '',
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

watch(existingRequest, (val) => {
  if (val && isEdit.value) {
    const extractTimeAsDate = (dateStr) => {
      if (!dateStr) return ''
      const date = new Date(dateStr)
      const timeDate = new Date(0, 0, 0, date.getHours(), date.getMinutes())
      return timeDate
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
      startTime: extractTimeAsDate(val.startAt),
      finishTime: extractTimeAsDate(val.finishAt),
      apptTime: extractTimeAsDate(val.apptTime),
      returnTime: extractTimeAsDate(val.returnTime),
      state: val.state || '',
      city: val.city || '',
      zip: val.zip || '',
      address: val.address || '',
      phone: val.phone || '',
      instructions: val.instructions || '',
      description: val.description || '',
      destination: val.destination || ''
    }
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
  if (val) {
    form.value.memberPersonId = String(val.value)
  } else {
    form.value.memberPersonId = null
  }
})

watch(selectedVolunteer, (val) => {
  if (val) {
    form.value.volunteerPersonId = String(val.value)
  } else {
    form.value.volunteerPersonId = null
  }
})

watch(() => form.value.villageId, (villageId) => {
  if (villageId) {
    fetchMembers()
    fetchVolunteers()
  }
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

const handleSubmit = async () => {
  try {
    if (!form.value.villageId) {
      toast.add({ severity: 'error', summary: 'Error', detail: 'Village is required', life: 3000 })
      return
    }

    isSubmitting.value = true

    const combineDateAndTime = (date, timeObj) => {
      if (!date || !timeObj) return null
      const d = new Date(date)
      const t = new Date(timeObj)
      d.setHours(t.getHours(), t.getMinutes(), 0, 0)
      return d.toISOString()
    }

    const payload = {
      villageId: form.value.villageId,
      memberPersonId: form.value.memberPersonId?.trim() || null,
      volunteerPersonId: form.value.volunteerPersonId?.trim() || null,
      status: form.value.status || null,
      serviceName: form.value.serviceName || null,
      transportationType: form.value.transportationType || null,
      startAt: combineDateAndTime(form.value.serviceDate, form.value.startTime),
      finishAt: combineDateAndTime(form.value.serviceDate, form.value.finishTime),
      apptTime: combineDateAndTime(form.value.serviceDate, form.value.apptTime),
      returnTime: combineDateAndTime(form.value.serviceDate, form.value.returnTime),
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

    setTimeout(() => {
      router.push({ name: 'meta-service-requests' })
    }, 500)
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
  router.back()
}
</script>

<template>
  <div class="service-request-create-edit">
    <Card class="form-card">
      <template #header>
        <div class="card-header-wrapper">
          <h2 class="card-title">{{ isEdit ? 'Edit Service Request' : 'Create Service Request' }}</h2>
        </div>
      </template>

      <template #content>
        <div v-if="isLoadingRequest && isEdit" class="loading">Loading...</div>
        <form v-else class="form" @submit.prevent="handleSubmit">
          <!-- Village Selection (Required) -->
          <div class="form-group">
            <label for="villageId" class="form-label required">Village</label>
            <Select
              id="villageId"
              v-model="form.villageId"
              :options="villageOptions"
              option-label="label"
              option-value="value"
              placeholder="Select a village"
            />
          </div>

          <!-- Service Info -->
          <div class="form-row">
            <div class="form-group">
              <label for="serviceName" class="form-label">Service Name</label>
              <Select
                id="serviceName"
                v-model="form.serviceName"
                :options="serviceNameOptions"
                placeholder="Select a service"
              />
            </div>
            <div class="form-group">
              <label for="transportationType" class="form-label">Transportation Type</label>
              <Select
                id="transportationType"
                v-model="form.transportationType"
                :options="transportationTypeOptions"
                placeholder="Select type"
              />
            </div>
          </div>

          <!-- People -->
          <div class="form-row">
            <div class="form-group">
              <label for="memberPersonId" class="form-label">Member</label>
              <AutoComplete
                id="memberPersonId"
                v-model="selectedMember"
                :suggestions="memberFilteredOptions"
                option-label="label"
                placeholder="Search member"
                @complete="filterMembers"
              />
            </div>
            <div class="form-group">
              <label for="volunteerPersonId" class="form-label">Volunteer</label>
              <AutoComplete
                id="volunteerPersonId"
                v-model="selectedVolunteer"
                :suggestions="volunteerFilteredOptions"
                option-label="label"
                placeholder="Search volunteer"
                @complete="filterVolunteers"
              />
            </div>
          </div>

          <!-- Service Date -->
          <div class="form-group">
            <label for="serviceDate" class="form-label">Service Date</label>
            <Calendar
              id="serviceDate"
              v-model="form.serviceDate"
              date-format="mm/dd/yy"
            />
          </div>

          <!-- Times -->
          <div class="form-row">
            <div class="form-group">
              <label for="startTime" class="form-label">Start Time</label>
              <Calendar
                id="startTime"
                v-model="form.startTime"
                time-only
                hour-format="12"
                :step-minute="15"
              />
            </div>
            <div class="form-group">
              <label for="finishTime" class="form-label">Finish Time</label>
              <Calendar
                id="finishTime"
                v-model="form.finishTime"
                time-only
                hour-format="12"
                :step-minute="15"
              />
            </div>
          </div>

          <!-- Appointment Times -->
          <div class="form-row">
            <div class="form-group">
              <label for="apptTime" class="form-label">Appointment Time</label>
              <Calendar
                id="apptTime"
                v-model="form.apptTime"
                time-only
                hour-format="12"
                :step-minute="15"
              />
            </div>
            <div class="form-group">
              <label for="returnTime" class="form-label">Return Time</label>
              <Calendar
                id="returnTime"
                v-model="form.returnTime"
                time-only
                hour-format="12"
                :step-minute="15"
              />
            </div>
          </div>

          <!-- Status -->
          <div class="form-group">
            <label for="status" class="form-label">Status</label>
            <Select
              id="status"
              v-model="form.status"
              :options="['Open', 'Confirmed']"
              placeholder="Select status"
            />
          </div>

          <!-- Location Info -->
          <div class="form-row">
            <div class="form-group">
              <label for="destination" class="form-label">Destination</label>
              <InputText
                id="destination"
                v-model="form.destination"
                placeholder="Where are they going?"
              />
            </div>
            <div class="form-group">
              <label for="address" class="form-label">Address</label>
              <InputText
                id="address"
                v-model="form.address"
                placeholder="Street address"
              />
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label for="city" class="form-label">City</label>
              <InputText
                id="city"
                v-model="form.city"
                placeholder="City"
              />
            </div>
            <div class="form-group">
              <label for="state" class="form-label">State</label>
              <Select
                id="state"
                v-model="form.state"
                :options="stateOptions"
                placeholder="Select state"
              />
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label for="zip" class="form-label">Zip</label>
              <InputText
                id="zip"
                v-model="form.zip"
                placeholder="Zip code"
              />
            </div>
            <div class="form-group">
              <label for="phone" class="form-label">Phone</label>
              <InputText
                id="phone"
                v-model="form.phone"
                placeholder="Phone number"
              />
            </div>
          </div>

          <!-- Created At (Edit Mode Only) -->
          <div v-if="isEdit" class="form-group">
            <label for="createdAt" class="form-label">Created At</label>
            <Calendar
              id="createdAt"
              v-model="form.createdAt"
              show-time
              hour-format="24"
              :disabled="true"
            />
          </div>

          <!-- Notes -->
          <div class="form-group">
            <label for="instructions" class="form-label">Instructions</label>
            <Textarea
              id="instructions"
              v-model="form.instructions"
              placeholder="Special instructions"
              rows="3"
            />
          </div>

          <div class="form-group">
            <label for="description" class="form-label">Description</label>
            <Textarea
              id="description"
              v-model="form.description"
              placeholder="Detailed description"
              rows="3"
            />
          </div>

          <!-- Actions -->
          <div class="form-actions">
            <Button
              type="button"
              label="Cancel"
              severity="secondary"
              @click="handleCancel"
              :disabled="isSubmitting"
            />
            <Button
              type="submit"
              :label="isEdit ? 'Update' : 'Create'"
              :loading="isSubmitting"
            />
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

.card-header-wrapper {
  padding: 1rem;
  border-bottom: 1px solid var(--color-border-default);
}

.card-title {
  margin: 0;
  color: var(--color-text-primary);
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

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

.form-actions {
  display: flex;
  gap: 1rem;
  justify-content: flex-end;
  padding-top: 1rem;
  border-top: 1px solid var(--color-border-default);
}

.loading {
  padding: 2rem;
  text-align: center;
  color: var(--color-text-dim);
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
