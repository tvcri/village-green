// Pure logic for the notification-history UI. All branching that can be wrong
// (status derivation, timestamp selection, recipient formatting, sort order)
// lives here so it can be unit-tested without a component test harness.

export const eventStatus = (entry) => {
  if (entry?.sentAt) return 'sent'
  if (entry?.failedAt) return 'failed'
  return 'pending'
}

export const eventStatusSeverity = (status) => {
  switch (status) {
    case 'sent': return 'success'
    case 'failed': return 'danger'
    default: return 'secondary'
  }
}

export const formatEventDate = (dateStr) => {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  return date.toLocaleString('en-US', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

export const outcomeLabel = (entry) => {
  const status = eventStatus(entry)
  if (status === 'sent') return `Sent ${formatEventDate(entry.sentAt)}`
  if (status === 'failed') return `Failed ${formatEventDate(entry.failedAt)}`
  return `Created ${formatEventDate(entry?.createdAt)}`
}

export const eventTypeLabel = (eventType) => {
  if (!eventType) return ''
  return eventType.charAt(0).toUpperCase() + eventType.slice(1)
}

// Recipient fullNames as an array (for rendering one chip per name). Names are
// themselves "Last, First", so comma-joining reads ambiguously — the UI renders
// these as individual chips instead. Sorted alphabetically because the API
// returns recipients in non-deterministic personId order. Empty array when
// there are no recipients.
export const recipientList = (entry) =>
  (entry?.recipients ?? [])
    .map(r => r.fullName)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b))

export const sortHistory = (history) =>
  (Array.isArray(history) ? [...history] : [])
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
