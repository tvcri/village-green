'use strict'

const SmError = require('../utils/error')
const { hasPermission } = require('../utils/authz')
const { getAudience, listAudiences } = require('../service/mailingLabels/audiences')
const { groupByAddress } = require('../service/mailingLabels/groupByAddress')

// Each audience declares its own permission and scope. hasPermission with no
// villageId option is the federation-wide check — passes only for a
// federation-scoped grant or the '*' wildcard (utils/authz.js:63-71; same
// pattern as controllers/Person.js:15). Village-scoped audiences (none
// yet) will pass { villageId } per their params.
function canUse (userObject, audience) {
  return hasPermission(userObject, audience.permission)
}

module.exports.getMailingLabelAudiences = async function getMailingLabelAudiences (req, res, next) {
  try {
    const available = listAudiences()
      .filter(a => canUse(req.userObject, a))
      .map(({ id, label, description, params }) => ({ id, label, description, params }))
    res.json(available)
  }
  catch (err) {
    next(err)
  }
}

module.exports.getMailingLabels = async function getMailingLabels (req, res, next) {
  try {
    const audience = getAudience(req.query.audience)
    if (!audience) throw new SmError.NotFoundError('Unknown audience')
    if (!canUse(req.userObject, audience)) throw new SmError.PrivilegeError()

    const rows = await audience.query({})
    const { labels, summary, unmailable } = groupByAddress(rows)
    res.json({ audience: audience.id, labels, summary, warnings: { unmailable } })
  }
  catch (err) {
    next(err)
  }
}
