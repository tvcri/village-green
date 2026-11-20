<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import { useCurrentUser } from '../../../shared/composables/useCurrentUser.js'

const router = useRouter()
const { hasPermission } = useCurrentUser()

const sections = [
  {
    key: 'constituents',
    icon: 'pi-users',
    heading: 'Constituents',
    blurb:
      'Members and volunteers, from first application onward. Add new people, work applications through intake, record trainings and positions, and keep each record current.',
    actions: [
      { label: 'Persons', route: 'meta-persons' },
      { label: 'Trainings', route: 'meta-trainings', permission: 'volunteer:read' },
      { label: 'Positions', route: 'meta-positions', permission: 'volunteer:read' },
    ],
  },
  {
    key: 'operations',
    icon: 'pi-list-check',
    heading: 'Operations',
    blurb:
      'The day-to-day service work. Create and track ride, errand, home help, and tech support requests, and look up friendly visits by member, volunteer, or date.',
    actions: [
      { label: 'Service Requests', route: 'meta-service-requests' },
      { label: 'Friends', route: 'meta-friends' },
    ],
  },
  {
    key: 'office',
    icon: 'pi-envelope',
    heading: 'Office',
    blurb: 'Correspondence and print output for members and volunteers.',
    actions: [{ label: 'Mailing Labels', route: 'meta-mailing-labels' }],
  },
  {
    key: 'reporting',
    icon: 'pi-chart-bar',
    heading: 'Reporting',
    blurb: 'Service activity over a date range you choose.',
    actions: [{ label: 'Metrics', route: 'meta-metrics' }],
  },
  {
    key: 'integrations',
    icon: 'pi-arrow-right-arrow-left',
    heading: 'Integrations',
    blurb: 'Keep Village Green in step with the other systems TVCRI uses.',
    actions: [{ label: 'LGL', route: 'meta-sync-holds', permission: 'sync:read' }],
  },
]

// A card shows only the buttons this user may use, and a card left with none
// is dropped rather than shown empty.
const visibleSections = computed(() => sections
  .map(section => ({
    ...section,
    actions: section.actions.filter(a => !a.permission || hasPermission(a.permission)),
  }))
  .filter(section => section.actions.length))
</script>

<template>
  <div class="meta-village">
    <h1>Hub</h1>

    <div class="sections">
      <section
        v-for="section in visibleSections"
        :key="section.key"
        class="section-card"
      >
        <h2>
          <i :class="['pi', section.icon]" aria-hidden="true"></i>
          {{ section.heading }}
        </h2>
        <p class="blurb">{{ section.blurb }}</p>
        <div class="actions">
          <Button
            v-for="action in section.actions"
            :key="action.route"
            :label="action.label"
            @click="router.push({ name: action.route })"
          />
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.meta-village {
  padding: 2rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

h1 {
  margin: 0;
  color: var(--color-text-primary);
}

.sections {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(20rem, 1fr));
  gap: 1.25rem;
}

.section-card {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1.25rem;
  background-color: var(--color-background-light);
  border: 1px solid var(--color-border-default);
  border-radius: 6px;
  box-shadow: var(--box-shadow-card);
}

.section-card h2 {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin: 0;
  font-size: 1.15rem;
  color: var(--color-text-bright);
}

.section-card h2 .pi {
  font-size: 1.25rem;
  color: var(--color-primary);
}

.blurb {
  margin: 0;
  color: var(--color-text-primary);
  line-height: 1.5;
}

.actions {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-top: auto;
  padding-top: 0.25rem;
}
</style>
