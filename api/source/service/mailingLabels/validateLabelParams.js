'use strict'
const SmError = require('../../utils/error')

// The two cross-parameter rules OAS 3.0 cannot express (each query parameter
// carries an independent schema — "OpenAPI 3.0 does not support parameter
// dependencies and mutually exclusive parameters"). Values, enums, and ranges
// are the validator's job; only the combinations are checked here.
const MONTH_AUDIENCES = new Set(['birthday-month', 'join-month'])
const MEMBER_ONLY_AUDIENCES = new Set(['printed-newsletter', 'join-month'])

// Pure: throws SmError.UnprocessableError (422) on a bad combination. The
// controller calls this after OAS validation, so values are already coerced
// and enum-checked.
function validateLabelParams ({ audience, role, month }) {
  if (MONTH_AUDIENCES.has(audience)) {
    if (month === undefined) {
      throw new SmError.UnprocessableError(`audience ${audience} requires month`)
    }
  }
  else if (month !== undefined) {
    throw new SmError.UnprocessableError(`audience ${audience} does not accept month`)
  }
  if (MEMBER_ONLY_AUDIENCES.has(audience) && role !== 'member') {
    throw new SmError.UnprocessableError(`audience ${audience} requires role=member`)
  }
}

module.exports = { validateLabelParams }
