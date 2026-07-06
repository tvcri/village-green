const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_RE = /^[\d\s\-()+]{7,}$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const ZIP_RE = /^\d{5}$/

export function validatePersonForm (form, errors) {
  Object.keys(errors).forEach(k => delete errors[k])

  if (!form.firstName.trim()) errors.firstName = 'First name is required'
  if (!form.lastName.trim())  errors.lastName  = 'Last name is required'

  if (form.email && !EMAIL_RE.test(form.email))
    errors.email = 'Enter a valid email address'
  if (form.emergencyContactEmail && !EMAIL_RE.test(form.emergencyContactEmail))
    errors.emergencyContactEmail = 'Enter a valid email address'

  if (form.phone && !PHONE_RE.test(form.phone))
    errors.phone = 'Enter a valid phone number'
  if (form.cell && !PHONE_RE.test(form.cell))
    errors.cell = 'Enter a valid phone number'
  if (form.emergencyContactPhone && !PHONE_RE.test(form.emergencyContactPhone))
    errors.emergencyContactPhone = 'Enter a valid phone number'

  if (form.birthDate && (!DATE_RE.test(form.birthDate) || isNaN(Date.parse(form.birthDate))))
    errors.birthDate = 'Enter a valid date (YYYY-MM-DD)'

  if (form.zip && !ZIP_RE.test(form.zip))
    errors.zip = 'Zip must be 5 digits'

  return Object.keys(errors).length === 0
}
