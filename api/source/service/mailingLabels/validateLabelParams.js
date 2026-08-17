'use strict'
const SmError = require('../../utils/error')
const { AUDIENCE_RULES } = require('./audienceRules')

// The cross-parameter rules OAS 3.0 cannot express (each query parameter
// carries an independent schema — "OpenAPI 3.0 does not support parameter
// dependencies and mutually exclusive parameters"). Values, enums, and ranges
// are the validator's job; only the combinations are checked here, driven by
// the shared AUDIENCE_RULES table.
//
// Pure: throws SmError.UnprocessableError (422) on a bad combination. The
// controller calls this after OAS validation, so values are already coerced
// and enum-checked (the unknown-audience throw is unreachable insurance).
function validateLabelParams ({ audience, role, month }) {
  const rules = AUDIENCE_RULES[audience]
  if (!rules) {
    throw new SmError.UnprocessableError(`unknown audience: ${audience}`)
  }
  if (rules.requiresMonth) {
    if (month === undefined) {
      throw new SmError.UnprocessableError(`audience ${audience} requires month`)
    }
  }
  else if (month !== undefined) {
    throw new SmError.UnprocessableError(`audience ${audience} does not accept month`)
  }
  if (rules.memberOnly && role !== 'member') {
    throw new SmError.UnprocessableError(`audience ${audience} requires role=member`)
  }
}

module.exports = { validateLabelParams }
