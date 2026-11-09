'use strict'

const SmError = require('../utils/error')
const { hasPermission } = require('../utils/authz')
const { queryRecipients } = require('../service/mailingLabels/buildQuery')
const config = require('../utils/config')
const { todayCivil } = require('../utils/metricsRange')
const { civilYearsAgo } = require('../utils/civilDate')
const { DONOR_ROLES } = require('../service/mailingLabels/audienceRules')
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
    const { audience, role, villageId, month, lastGiftWithinYears } = req.query

    // Donor data is gated separately from person:read. Checked before
    // validation so a caller without donor:read gets 403, not a 422 that
    // would confirm the role exists for their audience.
    if (DONOR_ROLES.has(role) && !hasPermission(req.userObject, 'donor:read')) {
      throw new SmError.PrivilegeError()
    }
    validateLabelParams({ audience, role, month, lastGiftWithinYears })

    // The birthday-month audience reveals each recipient's birth month, so it
    // additionally requires the birth-date key (federation form: this
    // endpoint is federation-only). Later feature: relax to a birth-month key
    // when computed birth-month/age columns land (spec §4.11).
    if (audience === 'birthday-month' && !hasPermission(req.userObject, 'person:read_birth_date')) {
      throw new SmError.PrivilegeError()
    }

    // The window is a civil-date cutoff in the deployment's zone; absent
    // means any time (null), which keeps donors with no recorded gift.
    const lastGiftSince = lastGiftWithinYears
      ? civilYearsAgo(todayCivil(config.settings.civilTimeZone), lastGiftWithinYears)
      : null
    const rows = await queryRecipients({ audience, role, villageId, month, lastGiftSince })
    const { labels, summary, unmailable } = groupByAddress(rows)
    res.json({ audience, labels, summary, warnings: { unmailable } })
  }
  catch (err) {
    next(err)
  }
}
