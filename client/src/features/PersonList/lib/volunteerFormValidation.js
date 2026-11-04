import { dropReasonSent } from './memberFormValidation.js'

// `loaded` is the stored { status, dropReasonId } of an existing volunteer ({}
// for a new grant). Mirrors the API: a drop reason is required when the status
// is being changed to Dropped, or when the user changed the reason. A loaded
// Dropped volunteer with no reason stays saveable if neither changed.
export function validateVolunteerForm (form, errors, loaded = {}) {
  Object.keys(errors).forEach(k => delete errors[k])

  if (form.status === 'Dropped' && !form.dropReasonId && dropReasonSent(form, loaded))
    errors.dropReasonId = 'A drop reason is required'

  return Object.keys(errors).length === 0
}
