<script setup>
import { computed, ref } from 'vue'
import Card from 'primevue/card'
import Tag from 'primevue/tag'
import PersonMap from '../../components/PersonMap.vue'

const props = defineProps({
  person: {
    type: Object,
    required: true
  },
  personType: {
    type: String,
    enum: ['member', 'volunteer', 'member, volunteer'],
    required: true
  },
  columnCount: {
    type: Number,
    default: 4
  },
  detailLevel: {
    type: String,
    enum: ['info', 'full'],
    default: 'info'
  },
  // Explicit override for section visibility, independent of personType
  // (which reflects only *active* roles). Pass when the caller knows
  // memberDetail/volunteerDetail data exists even if the role is inactive.
  // Defaults (null) fall back to personType so single-role pages are unaffected.
  hasMemberDetail: {
    type: Boolean,
    default: null
  },
  hasVolunteerDetail: {
    type: Boolean,
    default: null
  }
})

const copiedEmail = ref(false)

const SHOW_MAP_KEY = 'vg.showMap'
const showMap = ref(localStorage.getItem(SHOW_MAP_KEY) !== 'false')

function toggleMap() {
  showMap.value = !showMap.value
  localStorage.setItem(SHOW_MAP_KEY, showMap.value)
}

const mapAddress = computed(() => {
  const p = props.person
  if (!p?.address && !p?.city) return ''
  return [p.address, p.city, p.state, p.zip].filter(Boolean).join(', ')
})

const isMember = computed(() => props.hasMemberDetail ?? (props.personType === 'member' || props.personType === 'member, volunteer'))
const isVolunteer = computed(() => props.hasVolunteerDetail ?? (props.personType === 'volunteer' || props.personType === 'member, volunteer'))
const isFullDetail = computed(() => props.detailLevel === 'full')

const serviceNotesSpan = computed(() => Math.min(props.columnCount, 2))

const copyEmail = async (email) => {
  try {
    await navigator.clipboard.writeText(email)
    copiedEmail.value = true
    setTimeout(() => {
      copiedEmail.value = false
    }, 2000)
  } catch (err) {
    console.error('Failed to copy email:', err)
  }
}
</script>

<template>
  <Card v-if="person" class="detail-card">
    <template #title>
      <div class="title-row">
        <span>{{ person.fullName }}</span>
        <Tag v-if="person.village?.name" :value="person.village.name" class="village-tag" />
      </div>
    </template>
    <template #content>
      <!-- Personal Information Section -->
      <div class="section">
        <h3 class="section-header">Personal Information</h3>
        <div v-if="person.firstName" class="detail-field">
          <span class="label">First Name:</span>
          <span class="value">{{ person.firstName }}</span>
        </div>

        <div v-if="person.middleInitial" class="detail-field">
          <span class="label">Middle Initial:</span>
          <span class="value">{{ person.middleInitial }}</span>
        </div>

        <div v-if="person.lastName" class="detail-field">
          <span class="label">Last Name:</span>
          <span class="value">{{ person.lastName }}</span>
        </div>

        <div v-if="person.nickname" class="detail-field">
          <span class="label">Nickname:</span>
          <span class="value">{{ person.nickname }}</span>
        </div>

        <div v-if="person.email" class="detail-field email-field">
          <span class="label">Email:</span>
          <div class="email-value-wrapper">
            <span class="value">{{ person.email }}</span>
            <button
              class="copy-button"
              :class="{ copied: copiedEmail }"
              @click="copyEmail(person.email)"
              :title="copiedEmail ? 'Copied!' : 'Copy email'"
            >
              <i :class="copiedEmail ? 'pi pi-check' : 'pi pi-copy'"></i>
            </button>
          </div>
        </div>

        <div v-if="person.phone || person.cell" class="detail-field">
          <span class="label">Phone:</span>
          <div class="phone-numbers">
            <a v-if="person.phone" :href="`tel:${person.phone}`" class="phone-item">
              <i class="pi pi-phone"></i>
              <span class="phone-number">{{ person.phone }}</span>
            </a>
            <a v-if="person.cell" :href="`tel:${person.cell}`" class="phone-item">
              <i class="pi pi-mobile"></i>
              <span class="phone-number">{{ person.cell }}</span>
            </a>
          </div>
        </div>

        <div v-if="person.address" class="detail-field">
          <span class="label">Address:</span>
          <span class="value">{{ person.address }}</span>
        </div>

        <div v-if="person.city || person.state || person.zip" class="detail-field">
          <span class="label">City, State, Zip:</span>
          <span class="value">{{ person.city }}{{ person.state ? ', ' + person.state : '' }}{{ person.zip ? ' ' + person.zip : '' }}</span>
        </div>

        <div v-if="person.birthDate" class="detail-field">
          <span class="label">Birth Date:</span>
          <span class="value">{{ person.birthDate }}</span>
        </div>
      </div>

      <!-- Member-specific Section -->
      <div v-if="isMember" class="section">
        <h3 class="section-header">Member Information</h3>
        <div v-if="person.memberNumber" class="detail-field">
          <span class="label">Member #:</span>
          <span class="value">{{ person.memberNumber }}</span>
        </div>

        <div v-if="person.memberLevel" class="detail-field">
          <span class="label">Member Level:</span>
          <span class="value">{{ person.memberLevel }}</span>
        </div>

        <div v-if="person.primaryPerson?.fullName" class="detail-field">
          <span class="label">Primary Member:</span>
          <span class="value">{{ person.primaryPerson.fullName }}</span>
        </div>

        <div v-if="person.joinDate" class="detail-field">
          <span class="label">Join Date:</span>
          <span class="value">{{ person.joinDate }}</span>
        </div>

        <template v-if="isFullDetail">
          <div v-if="person.memberType" class="detail-field">
            <span class="label">Member Type:</span>
            <span class="value">{{ person.memberType }}</span>
          </div>

          <div v-if="person.secondaryType" class="detail-field">
            <span class="label">Secondary Type:</span>
            <span class="value">{{ person.secondaryType }}</span>
          </div>

          <div v-if="person.status" class="detail-field">
            <span class="label">Status:</span>
            <span class="value">{{ person.status }}</span>
          </div>

          <div v-if="person.status === 'Dropped' && person.dropReason" class="detail-field">
            <span class="label">Drop Reason:</span>
            <span class="value">{{ person.dropReason }}</span>
          </div>

          <div v-if="person.householdSize != null" class="detail-field">
            <span class="label">Household Size:</span>
            <span class="value">{{ person.householdSize }}</span>
          </div>

          <div v-if="person.householdDues != null" class="detail-field">
            <span class="label">Household Dues:</span>
            <span class="value">{{ Number(person.householdDues).toLocaleString('en-US', { style: 'currency', currency: 'USD' }) }}</span>
          </div>

          <div v-if="person.quickbooksKey" class="detail-field">
            <span class="label">Quickbooks Key:</span>
            <span class="value">{{ person.quickbooksKey }}</span>
          </div>

          <div v-if="person.printedNewsletter != null" class="detail-field">
            <span class="label">Printed Newsletter:</span>
            <span class="value">{{ person.printedNewsletter ? 'Yes' : 'No' }}</span>
          </div>
        </template>
      </div>

      <!-- Member Notes Section (full detail only) -->
      <div v-if="isFullDetail && (person.confidentialNotes || person.statusChangeNotes || person.miscNotes)" class="section">
        <h3 class="section-header">Member Notes</h3>
        <div v-if="person.confidentialNotes" class="detail-field notes-field">
          <span class="label">Confidential Notes:</span>
          <span class="value">{{ person.confidentialNotes }}</span>
        </div>

        <div v-if="person.statusChangeNotes" class="detail-field notes-field">
          <span class="label">Status Change Notes:</span>
          <span class="value">{{ person.statusChangeNotes }}</span>
        </div>

        <div v-if="person.miscNotes" class="detail-field notes-field">
          <span class="label">Misc Notes:</span>
          <span class="value">{{ person.miscNotes }}</span>
        </div>
      </div>

      <!-- Service Notes Section -->
      <div v-if="person.serviceNotes" class="section">
        <h3 class="section-header">Service Notes</h3>
        <div class="detail-field service-notes-field">
          <span class="value">{{ person.serviceNotes }}</span>
        </div>
      </div>

      <!-- Volunteer-specific Section -->
      <div v-if="isVolunteer && (person.capabilities?.length || person.vettings?.length || person.active != null)" class="section">
        <h3 class="section-header">Volunteer Information</h3>
        <div v-if="person.capabilities?.length" class="detail-field capabilities-field">
          <span class="label">Capabilities:</span>
          <div class="capabilities-list">
            <Tag
              v-for="cap in person.capabilities"
              :key="cap"
              :value="cap"
              class="capability-badge"
            />
          </div>
        </div>

        <template v-if="isFullDetail">

          <div v-if="person.active != null" class="detail-field">
            <span class="label">Active:</span>
            <span class="value">{{ person.active ? 'Yes' : 'No' }}</span>
          </div>
          <template v-if="person.vettings?.length">
            <div v-for="vetting in person.vettings" :key="`${vetting.vettingTypeId}-${vetting.dateEntered}`" class="detail-field">
              <span class="label">{{ vetting.name }}:</span>
              <span class="value">
                {{ vetting.dateEntered || 'Unknown' }}<template v-if="vetting.dateExpired"> – {{ vetting.dateExpired }}</template>
              </span>
            </div>
          </template>
        </template>
      </div>


      <!-- Emergency Contact Section -->
      <div v-if="person.emergencyContactName || person.emergencyContactRelationship || person.emergencyContactPhone || person.emergencyContactEmail" class="section">
        <h3 class="section-header">Emergency Contact</h3>
        <div v-if="person.emergencyContactName" class="detail-field">
          <span class="label">Name:</span>
          <span class="value">{{ person.emergencyContactName }}</span>
        </div>

        <div v-if="person.emergencyContactRelationship" class="detail-field">
          <span class="label">Relationship:</span>
          <span class="value">{{ person.emergencyContactRelationship }}</span>
        </div>

        <div v-if="person.emergencyContactPhone" class="detail-field">
          <span class="label">Phone:</span>
          <div class="phone-numbers">
            <a :href="`tel:${person.emergencyContactPhone}`" class="phone-item">
              <i class="pi pi-phone"></i>
              <span class="phone-number">{{ person.emergencyContactPhone }}</span>
            </a>
          </div>
        </div>

        <div v-if="person.emergencyContactEmail" class="detail-field">
          <span class="label">Email:</span>
          <span class="value">{{ person.emergencyContactEmail }}</span>
        </div>
      </div>
      <div v-if="mapAddress" class="map-section">
        <button class="map-toggle" @click="toggleMap">
            {{ showMap ? 'Always Hide Maps' : 'Always Show Maps' }}
        </button>
        <PersonMap v-if="showMap" :address="mapAddress" />
      </div>
    </template>
  </Card>

  <div v-else class="not-found">
    <p>{{ personType === 'member' ? 'Member' : 'Volunteer' }} not found.</p>
  </div>
</template>

<style scoped>
@import '../styles/phone-link.css';

.detail-card {
  max-width: 1100px;
  border: 1px solid var(--color-border-default);
  box-shadow: var(--box-shadow-card);
}

:deep(.p-card-title) {
  font-weight: 700;
  font-size: 2rem;
}

.title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.village-tag {
  font-size: 0.9rem;
  flex-shrink: 0;
}

:deep(.p-card-content) {
  display: block;
}

.detail-field {
  display: flex;
  flex-direction: column;
  padding-bottom: 0;
  margin-bottom: 0;
  border-bottom: none;
}

.detail-field .label {
  font-weight: 600;
  color: var(--color-text-dim);
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 0.5rem;
}

.detail-field .value {
  color: var(--color-text-primary);
  font-size: 1rem;
  font-weight: 600;
  word-break: break-word;
}


.section {
  display: grid;
  grid-template-columns: repeat(v-bind(columnCount), 1fr);
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

.email-field {
  position: relative;
}

.email-value-wrapper {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.copy-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
  padding: 0;
  border: 1px solid var(--color-border-default);
  border-radius: 4px;
  background-color: transparent;
  color: var(--color-text-dim);
  cursor: pointer;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.copy-button:hover {
  background-color: var(--color-background-light);
  color: var(--p-primary-600);
  border-color: var(--p-primary-600);
}

.copy-button.copied {
  color: var(--color-success);
  border-color: var(--color-success);
}

.phone-numbers {
  display: flex;
  gap: 1rem;
  align-items: center;
  font-weight: 600
}
.phone_number {
  white-space: nowrap;
}


.phone-item i {
  color: var(--color-text-dim);
  font-size: 0.9rem;
  flex-shrink: 0;
}

.capabilities-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.capability-badge {
  display: inline-block;
  padding: 0.3rem 0.6rem;
  background-color: var(--color-background-dark);
  border: 1px solid var(--color-border-default);
  border-radius: 6px;
  font-size: 0.9rem;
  color: var(--color-text-dim);
}

.capabilities-field {
  grid-column: 1 / -1;
}

.service-notes-field {
  grid-column: span v-bind(serviceNotesSpan);
}

.notes-field {
  grid-column: 1 / -1;
}

.map-section {
  margin-top: 2rem;
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

.not-found {
  text-align: center;
  padding: 2rem;
  color: var(--color-text-dim);
}

@media (max-width: 900px) {
  .section {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 600px) {
  .section {
    grid-template-columns: 1fr;
    gap: 1rem;
  }
}
</style>
