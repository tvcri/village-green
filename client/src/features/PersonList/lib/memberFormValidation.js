import { isRealCivilDate } from '../../../shared/lib/civilDate.js'

// memberLevel and joinDate are required by the API (MemberPut). Validate them
// here so the form never sends a body the server will reject.
export function validateMemberForm (form, errors) {
  Object.keys(errors).forEach(k => delete errors[k])

  if (!form.memberLevel) errors.memberLevel = 'Member level is required'

  if (!form.joinDate) errors.joinDate = 'Join date is required'
  else if (!isRealCivilDate(form.joinDate)) errors.joinDate = 'Enter a valid date (YYYY-MM-DD)'

  if (form.memberLevel === 'Secondary' && !form.primaryPersonId)
    errors.primaryPersonId = 'A Secondary member needs a primary person'

  return Object.keys(errors).length === 0
}
