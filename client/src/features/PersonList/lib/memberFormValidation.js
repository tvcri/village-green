const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// joinDate is a civil date string — validate the calendar parts directly
// rather than via Date.parse, which accepts '2026-02-31' by rolling over.
function isRealCivilDate (s) {
  if (!DATE_RE.test(s)) return false
  const [y, m, d] = s.split('-').map(Number)
  if (m < 1 || m > 12) return false
  const date = new Date(y, m - 1, d)
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d
}

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
