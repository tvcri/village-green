'use strict'

const SmError = require('../utils/error')
const { hasPermission } = require('../utils/authz')
const { queryRecipients } = require('../service/mailingLabels/buildQuery')
const { validateLabelParams } = require('../service/mailingLabels/validateLabelParams')
const { groupByAddress } = require('../service/mailingLabels/groupByAddress')

// Mailing labels are federation-only: hasPermission with no villageId option
// is the federation-wide check — passes only for a federation-scoped grant or
// the '*' wildcard (utils/authz.js; same pattern as controllers/Person.js).
// The villageId query param is a filter, not an access boundary.
module.exports.getMailingLabels = async function getMailingLabels (req, res, next) {
  try {
    if (!hasPermission(req.userObject, 'person:read')) throw new SmError.PrivilegeError()

    // OAS has already enum-checked and coerced these (typed query params are
    // always coerced by express-openapi-validator — never string-compare).
    const { audience, role, villageId, month } = req.query
    validateLabelParams({ audience, role, month })

    const rows = await queryRecipients({ audience, role, villageId, month })
    const { labels, summary, unmailable } = groupByAddress(rows)
    res.json({ audience, labels, summary, warnings: { unmailable } })
  }
  catch (err) {
    next(err)
  }
}
