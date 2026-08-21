'use strict';

const SmError = require('../utils/error')
const MetricsService = require('../service/MetricsService')
const { hasPermission } = require('../utils/authz')

module.exports.getMetaMetrics = async function getMetaMetrics (req, res, next) {
  try {
    const { start, end } = req.query
    // Scope derives from grants rather than a query param. This diverges from
    // GET /service-requests, which demands an explicit villageId list from a
    // non-federation caller — that strictness suits an endpoint returning rows,
    // but a metrics chart has no filter UI through which a user could name
    // villages, and pushing enumeration to the client would put scope
    // determination there. See the design spec, "The endpoint".
    const villageIds = hasPermission(req.userObject, 'sr:read')
      ? null // federation read: unrestricted
      : Object.keys(req.userObject.grants).filter(
          vid => hasPermission(req.userObject, 'sr:read', { villageId: vid })
        )
    if (villageIds !== null && villageIds.length === 0) {
      throw new SmError.PrivilegeError()
    }
    const response = await MetricsService.getMetaMetrics({ villageIds, start, end })
    res.json(response)
  }
  catch (err) {
    next(err)
  }
}
