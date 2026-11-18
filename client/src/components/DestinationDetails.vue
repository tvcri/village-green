<script setup>
// Field rows for a request's destinations. One destination keeps today's
// labels; two or more become "Destination N" groups. The wrappers use
// display: contents so the fields stay direct grid items of the host page's
// .section grid.
defineProps({
  destinations: { type: Array, default: () => [] },
  // The coordinator page links the phone; the volunteer page shows none.
  showPhone: { type: Boolean, default: false }
})
</script>

<template>
  <div class="destination-details">
    <div v-for="(d, i) in destinations" :key="i" class="destination-group">
      <h4 v-if="destinations.length > 1" class="destination-title">Destination {{ i + 1 }}</h4>
      <div v-if="d.destination" class="detail-field">
        <span class="label">{{ destinations.length > 1 ? 'Name' : 'Destination' }}:</span>
        <span class="value">{{ d.destination }}</span>
      </div>
      <div v-if="d.address" class="detail-field">
        <span class="label">Address:</span>
        <span class="value">{{ d.address }}</span>
      </div>
      <div v-if="d.city || d.state" class="detail-field">
        <span class="label">City/State:</span>
        <span class="value">{{ [d.city, d.state].filter(Boolean).join(', ') }}</span>
      </div>
      <div v-if="showPhone && d.phone" class="detail-field">
        <span class="label">Phone:</span>
        <div class="phone-numbers">
          <a :href="`tel:${d.phone}`" class="phone-item">
            <i class="pi pi-phone"></i>
            <span class="phone-number">{{ d.phone }}</span>
          </a>
        </div>
      </div>
    </div>
    <!-- display: contents leaves the host grid shared, so end the groups with a
         full-width rule; whatever follows starts on a new row. -->
    <div v-if="destinations.length > 1" class="destination-end" />
  </div>
</template>

<style scoped>
@import '../shared/styles/phone-link.css';

.destination-details,
.destination-group {
  display: contents;
}

.destination-end {
  grid-column: 1 / -1;
  border-top: 1px solid var(--color-border-default);
}

.destination-title {
  grid-column: 1 / -1;
  margin: 0;
  font-size: 0.85rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--color-text-dim);
}

.phone-numbers {
  font-weight: 600;
}

.phone-item i {
  color: var(--color-text-dim);
  font-size: 0.9rem;
}
</style>
