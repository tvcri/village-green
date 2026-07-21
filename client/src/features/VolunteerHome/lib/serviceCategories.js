// The VSS service-category vocabulary: each capability the caller may hold,
// paired with the serviceName prefix that identifies its requests. This is the
// client-side inverse of the API's buildCapabilityPrefixCase. Matching on the
// prefix absorbs the legacy whitespace-after-colon deviations (Errand:Shopping
// vs Errand: Shopping), since the cut is at the colon. 'Friends' is deliberately
// absent: it has no service type and is not a VSS-supported category.
// `key` doubles as the CSS class suffix for the category color treatments —
// the Service tag (.service-tag--rides) and the filter pill
// (.service-pill--rides); colors are defined via the --cat-* vars in <style>.
export const SERVICE_CATEGORIES = [
  { key: 'errands', label: 'Errands', prefix: 'Errand:' },
  { key: 'home-help', label: 'Home Help', prefix: 'Household Chores/Handy Help' },
  { key: 'rides', label: 'Rides', prefix: 'Ride:' },
  { key: 'tech-support', label: 'Tech Support', prefix: 'Tech Support' },
]

// The account volunteers (entries from /user volunteers[]) whose capabilities
// cover a request's serviceName — the client mirror of the API's per-person
// capability gate (VolunteerRequestService sign-up qualification). The server
// stays authoritative at write time, so drift here fails safe (a 404, not a
// wrong sign-up).
export function filterQualifying(volunteers, serviceName) {
  const name = serviceName ?? ''
  return (volunteers ?? []).filter(v =>
    (v.capabilities ?? []).some(label => {
      const prefix = SERVICE_CATEGORIES.find(c => c.label === label)?.prefix
      return prefix && name.startsWith(prefix)
    })
  )
}
