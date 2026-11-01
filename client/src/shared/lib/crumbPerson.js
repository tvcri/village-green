import { ref } from 'vue'

// The person the current Hub person page has loaded, for the breadcrumb.
// The optional :personName route param only arrives from the person list, so
// every other way onto these pages (a role form's Cancel or save, a crumb, a
// link from Trainings, a reload) lost the name. Each page sets this once its
// getPerson resolves; Breadcrumbs uses it only while route.params.personId
// still matches, so a stale entry from another person never shows.
export const crumbPerson = ref(null)

export const setCrumbPerson = (p) => {
  crumbPerson.value = p ? { personId: String(p.personId), fullName: p.fullName } : null
}
