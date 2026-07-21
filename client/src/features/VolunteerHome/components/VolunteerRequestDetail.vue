<script setup>
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import Card from 'primevue/card'
import Tag from 'primevue/tag'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import RadioButton from 'primevue/radiobutton'
import { useAsyncState } from '../../../shared/composables/useAsyncState.js'
import { useStatusSeverity } from '../../../shared/composables/useStatusSeverity.js'
import { formatServiceDate, timeStringToLabel } from '../../ServiceRequestList/lib/timeFields.js'
import { getHttpStatus, isPrivacyAckError } from '../../../shared/api/apiClient.js'
import { getVolunteerRequest, signUpVolunteerRequest, releaseVolunteerRequest } from '../api/volunteerRequestApi.js'
import { getUser } from '../../../shared/api/userApi.js'
import { filterQualifying } from '../lib/serviceCategories.js'
import ServiceRequestMap from '../../../components/ServiceRequestMap.vue'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const confirm = useConfirm()
const { getStatusSeverity } = useStatusSeverity()

const serviceRequestId = computed(() => route.params.id)

// Volunteer self-cancel (Release) is hidden until the customer works out
// back-office support for it. The button below is gated on this flag; the
// release plumbing (confirmRelease/doRelease and the API endpoint) stays
// intact, so flipping this to true re-enables the feature with no other
// change. The API accepts release regardless — this is a UI hide only.
const RELEASE_ENABLED = false

const { state: request, isLoading, execute: fetchRequest } = useAsyncState(
  () => getVolunteerRequest(serviceRequestId.value),
  {
    immediate: true,
    onError: (err) => {
      if (isPrivacyAckError(err)) return
      toast.add({ severity: 'warn', summary: 'Not available', detail: 'This request is no longer available to view.', life: 5000 })
      router.replace({ name: 'volunteer' })
    },
  }
)

// Account volunteers (shared household email => several). Fetched from /user
// like VolunteerHome does — no shared user store exists. onError: null — a
// failed fetch degrades to single-volunteer behavior (no picker), and the
// server still validates the selection.
const { state: currentUser } = useAsyncState(
  () => getUser(),
  { immediate: true, initialState: null, onError: null }
)
const accountVolunteers = computed(() => currentUser.value?.volunteers ?? [])
const isMultiVolunteer = computed(() => accountVolunteers.value.length > 1)

// The volunteers who can take THIS request (per-person capability match,
// mirroring the server's sign-up qualification; the server stays
// authoritative at write time).
const qualifyingVolunteers = computed(() =>
  filterQualifying(accountVolunteers.value, request.value?.serviceName)
)

// "First Last" for names inside sentences (confirm dialog, Confirmed banner,
// toasts). Tabular displays (Volunteer column, picker list) keep the
// "Last, First" fullName served as `name`, matching the Member columns.
function informalName(v) {
  if (!v) return ''
  return [v.firstName, v.lastName].filter(Boolean).join(' ') || v.name || ''
}

function informalVolunteerName(personId) {
  return informalName(accountVolunteers.value.find(v => v.personId === String(personId)))
}

// Multi-volunteer accounts see WHO is confirmed; single-volunteer accounts
// keep the second-person copy.
const confirmedBannerText = computed(() => {
  const who = isMultiVolunteer.value ? informalVolunteerName(request.value?.volunteerPersonId) : ''
  return who
    ? `${who} is confirmed for this request. Please call the member to coordinate the service.`
    : `You're confirmed for this request. Please call the member to coordinate your service.`
})

const pickerVisible = ref(false)
const pickedPersonId = ref(null)

const SHOW_MAP_KEY = 'vg.showMap'
const showMap = ref(localStorage.getItem(SHOW_MAP_KEY) !== 'false')

function toggleMap() {
  showMap.value = !showMap.value
  localStorage.setItem(SHOW_MAP_KEY, showMap.value)
}

// Open: member -> destination. Confirmed (caller's own): volunteer -> member -> destination.
// volunteerAddress can come back as a non-null object with every field null
// (the volunteer has no address on file) -- treat that the same as absent
// so the map falls back to a member-only route instead of vanishing.
const volunteerAddressString = computed(() => {
  const vol = request.value?.volunteerAddress
  if (!vol) return ''
  return [vol.address, vol.city, vol.state, vol.zip].filter(Boolean).join(', ')
})

const mapOrigin = computed(() => {
  if (volunteerAddressString.value) return volunteerAddressString.value
  const mem = request.value?.member
  if (!mem) return ''
  return [mem.address, mem.city, mem.state, mem.zip].filter(Boolean).join(', ')
})

const mapDestination = computed(() => {
  const r = request.value
  if (!r || (!r.address && !r.city)) return ''
  return [r.address, r.city, r.state].filter(Boolean).join(', ')
})

const mapWaypoint = computed(() => {
  if (!volunteerAddressString.value) return ''
  const mem = request.value?.member
  if (!mem) return ''
  return [mem.address, mem.city, mem.state, mem.zip].filter(Boolean).join(', ')
})

// serviceDate is a 'YYYY-MM-DD' civil string; formatServiceDate renders it
// without ever building a UTC-midnight Date.
function formatDateOnly(serviceDate) {
  return formatServiceDate(serviceDate) || null
}

// Round Trip requests have four distinct legs (start, arrive/apptTime,
// return, finish); everything else is a single start/finish span. Ported
// from ServiceRequestDetail.vue's timeDisplay. Times are 'HH:MM:SS' civil
// strings rendered via timeStringToLabel — never new Date(). timesFlexible
// means no specific times were set.
const timeDisplay = computed(() => {
  const r = request.value
  if (!r) return null
  if (r.timesFlexible) return [{ label: 'Times', value: 'Flexible' }]
  if (!r.startTime && !r.finishTime) return null
  const start = timeStringToLabel(r.startTime)
  const finish = timeStringToLabel(r.finishTime)
  if (r.transportationType === 'Round Trip') {
    return [
      { label: 'Start / Arrive', value: [start, timeStringToLabel(r.apptTime)].map(t => t ?? '—').join(' - ') },
      { label: 'Return / Finish', value: [timeStringToLabel(r.returnTime), finish].map(t => t ?? '—').join(' - ') }
    ]
  }
  return [
    { label: 'Start / Finish', value: [start, finish].map(t => t ?? '—').join(' / ') }
  ]
})

// The confirm sentence, shared by the single-volunteer ConfirmDialog and the
// multi-volunteer picker dialog (whose subject tracks the selected radio).
function signUpMessage(subject) {
  return `${subject} be confirmed as the provider for "${request.value?.serviceName || 'this request'}"${request.value?.member?.fullName ? ` for ${request.value.member.fullName}` : ''}.`
}

const pickerMessage = computed(() => {
  const chosen = qualifyingVolunteers.value.find(v => v.personId === pickedPersonId.value)
  return signUpMessage(chosen ? `${informalName(chosen)} will` : 'You will')
})

function confirmSignUp() {
  if (isMultiVolunteer.value && qualifyingVolunteers.value.length > 1) {
    // The picker doubles as the confirmation: same header and running text as
    // the single-volunteer confirm, with the volunteer radios under the
    // title. Preselect the first qualifier so the sentence always has a
    // subject; the text tracks the selection live.
    pickedPersonId.value = qualifyingVolunteers.value[0].personId
    pickerVisible.value = true
    return
  }
  // 0 or 1 qualifiers: no choice to make. Name the volunteer in the confirm
  // when the account has several; post the id only then (single-volunteer
  // accounts keep the omitted-body auto-select path — zero change for them).
  const chosen = isMultiVolunteer.value ? qualifyingVolunteers.value[0] : undefined
  confirm.require({
    header: 'Sign up for this request?',
    message: signUpMessage(chosen ? `${informalName(chosen)} will` : 'You will'),
    icon: 'pi pi-heart',
    acceptLabel: 'Sign up',
    rejectLabel: 'Cancel',
    accept: () => doSignUp(chosen?.personId),
  })
}

function submitPicker() {
  pickerVisible.value = false
  doSignUp(pickedPersonId.value)
}

async function doSignUp(personId) {
  try {
    await signUpVolunteerRequest(serviceRequestId.value, personId)
    const who = personId && isMultiVolunteer.value ? informalVolunteerName(personId) : ''
    toast.add({
      severity: 'success',
      summary: 'Confirmed',
      detail: who
        ? `${who} is confirmed for this request. Watch your email for details.`
        : 'You are confirmed for this request. Watch your email for details.',
      life: 5000,
    })
    fetchRequest()
    showCallReminder()
  }
  catch (err) {
    if (isPrivacyAckError(err)) return
    if (getHttpStatus(err) === 409) {
      if (err.body?.detail?.reason === 'alreadyOwnAccount') {
        // Taken by the OTHER volunteer on this account — stay on the page;
        // the refetch shows it as the account's confirmed request.
        const who = informalVolunteerName(err.body.detail.volunteerPersonId)
        toast.add({ severity: 'warn', summary: 'Already committed', detail: `${who || 'Another volunteer on your account'} is already committed to this request.`, life: 5000 })
        fetchRequest()
        return
      }
      toast.add({ severity: 'warn', summary: 'No longer available', detail: 'Another volunteer signed up for this request first.', life: 5000 })
      router.replace({ name: 'volunteer' })
    }
    else {
      toast.add({ severity: 'error', summary: 'Sign up failed', detail: 'Please try again or contact the hub.', life: 5000 })
    }
  }
}

// Post-signup reminder: a single-button acknowledgement modal shown after the
// PATCH succeeds. Reuses the shared ConfirmDialog; the reject button is hidden
// (display:none) so only the "Thanks for the reminder" acknowledgement shows.
function showCallReminder() {
  confirm.require({
    header: 'One more thing',
    message: 'Please remember to call the member as soon as possible to coordinate details of the service.',
    icon: 'pi pi-phone',
    acceptLabel: 'Thanks for the reminder',
    rejectProps: { style: 'display: none' },
    accept: () => {},
  })
}

function confirmRelease() {
  confirm.require({
    header: 'Release this commitment?',
    message: 'The request will reopen for other volunteers. The hub will see it as unassigned.',
    icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Release',
    rejectLabel: 'Keep it',
    acceptProps: { severity: 'danger' },
    accept: doRelease,
  })
}

async function doRelease() {
  try {
    await releaseVolunteerRequest(serviceRequestId.value)
    toast.add({ severity: 'info', summary: 'Released', detail: 'The request has been reopened.', life: 5000 })
    fetchRequest()
  }
  catch (err) {
    if (isPrivacyAckError(err)) return
    toast.add({ severity: 'error', summary: 'Release failed', detail: 'Please try again or contact the hub.', life: 5000 })
  }
}
</script>

<template>
  <div class="volunteer-request-detail">
    <Card v-if="request" class="detail-card">
      <template #header>
        <div class="card-header-wrapper">
          <h2 class="card-title">{{ `${request.serviceName ?? 'Service Request'} (#${request.requestNumber ?? request.serviceRequestId})` }}</h2>
          <div class="header-tags">
            <Tag v-if="request.villageName" :value="request.villageName" severity="secondary" />
            <Tag v-if="request.status" :value="request.status" :severity="getStatusSeverity(request.status)" />
          </div>
        </div>
      </template>
      <template #content>
        <div v-if="request.status === 'Confirmed'" class="confirmation-banner">
          <i class="pi pi-check-circle"></i>
          {{ confirmedBannerText }}
        </div>
        <div v-else-if="request.status === 'Completed'" class="confirmation-banner">
          <i class="pi pi-check-circle"></i>
          You completed this request.
        </div>

        <div class="section-row">
          <div v-if="request.member" class="section" :class="request.emergencyContact ? 'section-half' : 'section-full'">
            <h3 class="section-header">Member</h3>
            <div v-if="request.member.fullName" class="detail-field">
              <span class="label">Name:</span>
              <span class="value">{{ request.member.fullName }}</span>
            </div>
            <div v-if="request.member.address" class="detail-field">
              <span class="label">Address:</span>
              <span class="value">{{ request.member.address }}</span>
            </div>
            <div v-if="request.member.city || request.member.state || request.member.zip" class="detail-field">
              <span class="label">City/State/Zip:</span>
              <span class="value">{{ [request.member.city, request.member.state, request.member.zip].filter(Boolean).join(', ') }}</span>
            </div>
            <div v-if="request.member.phone" class="detail-field">
              <span class="label">Phone:</span>
              <a :href="`tel:${request.member.phone}`" class="phone-item">
                <i class="pi pi-phone"></i>
                <span class="phone-number">{{ request.member.phone }}</span>
              </a>
            </div>
            <div v-if="request.member.cell" class="detail-field">
              <span class="label">Cell:</span>
              <a :href="`tel:${request.member.cell}`" class="phone-item">
                <i class="pi pi-phone"></i>
                <span class="phone-number">{{ request.member.cell }}</span>
              </a>
            </div>
          </div>

          <div v-if="request.emergencyContact" class="section section-half">
            <h3 class="section-header">Emergency Contact</h3>
            <div v-if="request.emergencyContact.name" class="detail-field">
              <span class="label">Name:</span>
              <span class="value">{{ request.emergencyContact.name }}</span>
            </div>
            <div v-if="request.emergencyContact.relationship" class="detail-field">
              <span class="label">Relationship:</span>
              <span class="value">{{ request.emergencyContact.relationship }}</span>
            </div>
            <div v-if="request.emergencyContact.phone" class="detail-field">
              <span class="label">Phone:</span>
              <a :href="`tel:${request.emergencyContact.phone}`" class="phone-item">
                <i class="pi pi-phone"></i>
                <span class="phone-number">{{ request.emergencyContact.phone }}</span>
              </a>
            </div>
          </div>
        </div>

        <div v-if="request.description" class="section description-section">
          <h3 class="section-header">Description</h3>
          <p class="description-text">{{ request.description }}</p>
        </div>

        <div class="section">
          <h3 class="section-header">Request</h3>
          <div v-if="request.serviceDate" class="detail-field">
            <span class="label">Date:</span>
            <span class="value">{{ formatDateOnly(request.serviceDate) }}</span>
          </div>
          <div v-for="row in timeDisplay" :key="row.label" class="detail-field">
            <span class="label">{{ row.label }}:</span>
            <span class="value">{{ row.value }}</span>
          </div>
          <div v-if="request.transportationType" class="detail-field">
            <span class="label">Transportation Type:</span>
            <span class="value">{{ request.transportationType }}</span>
          </div>
          <div v-if="request.destination" class="detail-field">
            <span class="label">Destination:</span>
            <span class="value">{{ request.destination }}</span>
          </div>
          <div v-if="request.address" class="detail-field">
            <span class="label">Address:</span>
            <span class="value">{{ request.address }}</span>
          </div>
          <div v-if="request.city || request.state" class="detail-field">
            <span class="label">City/State:</span>
            <span class="value">{{ [request.city, request.state].filter(Boolean).join(', ') }}</span>
          </div>
          <div v-if="request.instructions" class="detail-field">
            <span class="label">Instructions:</span>
            <span class="value">{{ request.instructions }}</span>
          </div>
        </div>

        <div v-if="mapOrigin && mapDestination" class="map-section">
          <button class="map-toggle" @click="toggleMap">
            {{ showMap ? 'Always Hide Maps' : 'Always Show Maps' }}
          </button>
          <template v-if="showMap">
            <p class="map-route-label">
              <template v-if="volunteerAddressString">You <span class="arrow">➜</span> Member <span class="arrow">➜</span> Destination</template>
              <template v-else>Member <span class="arrow">➜</span> Destination</template>
            </p>
            <ServiceRequestMap
              :origin="mapOrigin"
              :destination="mapDestination"
              :waypoint="mapWaypoint"
            />
          </template>
        </div>

        <div class="actions">
          <Button
            v-if="request.status === 'Open'"
            label="Sign up!"
            icon="pi pi-heart"
            @click="confirmSignUp"
          />
          <Button
            v-if="RELEASE_ENABLED && request.status === 'Confirmed'"
            label="Release"
            icon="pi pi-times"
            severity="danger"
            outlined
            @click="confirmRelease"
          />
          <Button label="Back to List" text @click="router.push({ name: 'volunteer', query: route.query.from ? { tab: route.query.from } : {} })" />
        </div>
      </template>
    </Card>

    <div v-else-if="!isLoading" class="not-found">
      <p>Service request not found.</p>
    </div>

    <Dialog v-model:visible="pickerVisible" header="Sign up for this request?" modal :style="{ maxWidth: '28rem' }">
      <div v-for="v in qualifyingVolunteers" :key="v.personId" class="picker-row">
        <RadioButton v-model="pickedPersonId" :inputId="`vol-${v.personId}`" :value="v.personId" />
        <label :for="`vol-${v.personId}`">{{ v.name }}</label>
      </div>
      <div class="picker-message">
        <i class="pi pi-heart"></i>
        <span>{{ pickerMessage }}</span>
      </div>
      <template #footer>
        <Button label="Cancel" text @click="pickerVisible = false" />
        <Button label="Sign up" icon="pi pi-heart" :disabled="!pickedPersonId" @click="submitPicker" />
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
@import '../../../shared/styles/phone-link.css';

.volunteer-request-detail {
  padding: 2rem;
}

.detail-card {
  max-width: 1100px;
  border: 1px solid var(--color-border-default);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.card-header-wrapper {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  width: 100%;
  padding: 1.5rem 1.5rem 0 1.5rem;
}

.header-tags {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.confirmation-banner {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
  padding: 0.75rem 1rem;
  border-radius: 6px;
  background: color-mix(in srgb, var(--color-success) 15%, transparent);
  color: var(--color-text-primary);
  font-weight: 600;
  font-size: 0.95rem;
}

.confirmation-banner .pi-check-circle {
  color: var(--color-success);
}

.card-title {
  margin: 0;
  font-size: 1.75rem;
  font-weight: 700;
  color: var(--color-text-primary);
  flex: 1;
}

.section {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1rem 1.5rem;
  margin-top: 2rem;
  margin-bottom: 2rem;
}

.section:first-of-type {
  margin-top: 1rem;
}

.section:last-child {
  margin-bottom: 0;
}

.section-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  align-items: start;
  gap: 1rem 1.5rem;
  margin-top: 1rem;
  margin-bottom: 2rem;
}

.section-row .section {
  margin-top: 0;
  margin-bottom: 0;
}

.section-half {
  grid-template-columns: repeat(2, 1fr);
}

.section-full {
  grid-column: 1 / -1;
  grid-template-columns: repeat(4, 1fr);
}

.section-header {
  grid-column: 1 / -1;
  margin: 0 0 0.75rem 0;
  font-size: 0.95rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--color-primary);
  border-bottom: 2px solid var(--color-border-default);
  padding-bottom: 0.75rem;
}

.detail-field {
  display: flex;
  flex-direction: column;
  margin-bottom: 0;
}

.detail-field .label {
  font-weight: 600;
  color: var(--color-text-dim);
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 0.25rem;
}

.detail-field .value {
  color: var(--color-text-primary);
  font-size: 1rem;
  font-weight: 600;
  word-break: break-word;
}

.description-section {
  grid-template-columns: 1fr;
}

.description-text {
  margin: 0;
  grid-column: 1 / -1;
  color: var(--color-text-primary);
  font-size: 1rem;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.map-section {
  margin-top: 2rem;
}

.map-route-label {
  margin: 0 0 0.5rem 0;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--color-text-dim);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  line-height: 1;
}

.map-route-label .arrow {
  font-size: 1.1rem;
  font-weight: 900;
  vertical-align: middle;
  position: relative;
  top: -1px;
}

.map-toggle {
  margin-bottom: 0.75rem;
  padding: 0.4rem 1rem;
  font-size: 0.9rem;
  cursor: pointer;
  border: 1px solid var(--color-border-default);
  border-radius: 6px;
  background: transparent;
  color: var(--color-text-primary);
}

.map-toggle:hover {
  background: var(--color-border-default);
}

.actions {
  display: flex;
  gap: 1rem;
  margin-top: 2rem;
  padding-top: 1.5rem;
  border-top: 1px solid var(--color-border-default);
}

.not-found {
  text-align: center;
  padding: 2rem;
  color: var(--color-text-dim);
}

.picker-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0;
  font-size: 1rem;
  font-weight: 600;
}

/* Icon + running text below the radios — mirrors the shared ConfirmDialog's
   icon/message row so the multi-volunteer dialog reads like the single case. */
.picker-message {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  margin-top: 0.75rem;
  color: var(--color-text-primary);
}

.picker-message .pi-heart {
  font-size: 1.5rem;
  flex-shrink: 0;
}

@media (max-width: 900px) {
  .section {
    grid-template-columns: 1fr 1fr;
  }

  .section-row {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 600px) {
  .volunteer-request-detail {
    padding: 1rem;
  }

  .section {
    grid-template-columns: 1fr;
    gap: 1rem;
  }

  .section-half {
    grid-template-columns: 1fr;
  }
}
</style>
