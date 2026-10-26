import { isRealCivilDate } from '../../../shared/lib/civilDate.js'

// memberLevel and joinDate are required by the API (MemberPut). Validate them
// here so the form never sends a body the server will reject.
//
// `loaded` is the stored { status, dropReasonId } of an existing member ({} for
// a new grant). Mirrors the API: a drop reason is required when the status is
// being changed to Dropped, or when the user changed the reason. A loaded
// Dropped member with no reason stays saveable if neither changed.
export function validateMemberForm (form, errors, loaded = {}) {
  Object.keys(errors).forEach(k => delete errors[k])

  if (!form.memberLevel) errors.memberLevel = 'Member level is required'

  if (!form.joinDate) errors.joinDate = 'Join date is required'
  else if (!isRealCivilDate(form.joinDate)) errors.joinDate = 'Enter a valid date (YYYY-MM-DD)'

  if (form.memberLevel === 'Secondary' && !form.primaryPersonId)
    errors.primaryPersonId = 'A Secondary member needs a primary person'

  if (form.status === 'Dropped' && !form.dropReasonId && dropReasonSent(form, loaded))
    errors.dropReasonId = 'A drop reason is required'

  return Object.keys(errors).length === 0
}

// True when the save would carry a drop reason the API validates: the status
// is moving to Dropped, or the reason differs from the stored one.
export function dropReasonSent (form, loaded = {}) {
  if (form.status !== 'Dropped') return false
  return form.status !== loaded.status || (form.dropReasonId ?? null) !== (loaded.dropReasonId ?? null)
}

// Select options for the drop-reason catalog: active reasons, plus the
// member's current reason even when retired (suffixed), so an unchanged save
// stays possible. Order is the API's (by name).
export function dropReasonOptions (reasons, currentId) {
  return (reasons ?? [])
    .filter(r => !r.retired || r.memberDropReasonId === currentId)
    .map(r => ({
      label: r.retired ? `${r.name} (retired)` : r.name,
      value: r.memberDropReasonId,
    }))
}
