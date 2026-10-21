'use strict';

const SmError = require('../utils/error')
const MetricsService = require('../service/MetricsService')
const { hasPermission } = require('../utils/authz')
const { resolveMetricsRange, todayCivil } = require('../utils/metricsRange')
const config = require('../utils/config')

// Scope derives from grants rather than a query param. This diverges from
// GET /service-requests, which demands an explicit villageId list from a
// non-federation caller — that strictness suits an endpoint returning rows,
// but a metrics chart has no filter UI through which a user could name
// villages, and pushing enumeration to the client would put scope
// determination there. See the design spec, "The endpoint".
// Returns null for a federation read (unrestricted), else the granted ids.
function callerVillageScope (userObject) {
  const villageIds = hasPermission(userObject, 'sr:read')
    ? null
    : Object.keys(userObject.grants).filter(
        vid => hasPermission(userObject, 'sr:read', { villageId: vid })
      )
  if (villageIds !== null && villageIds.length === 0) {
    throw new SmError.PrivilegeError()
  }
  return villageIds
}

module.exports.getMetaMetrics = async function getMetaMetrics (req, res, next) {
  try {
    const today = todayCivil(config.settings.civilTimeZone)
    const { start, end } = resolveMetricsRange(req.query.start, req.query.end, today)
    const villageIds = callerVillageScope(req.userObject)
    const response = await MetricsService.getMetaMetrics({ villageIds, start, end })
    res.json(response)
  }
  catch (err) {
    next(err)
  }
}

module.exports.getMetaMetricsPersons = async function getMetaMetricsPersons (req, res, next) {
  try {
    const today = todayCivil(config.settings.civilTimeZone)
    const { start, end } = resolveMetricsRange(req.query.start, req.query.end, today)
    const villageIds = callerVillageScope(req.userObject)
    const villageId = req.query.villageId
    if (villageId !== undefined && villageIds !== null && !villageIds.includes(villageId)) {
      throw new SmError.PrivilegeError()
    }
    const personVillageIds = villageId !== undefined ? [villageId] : villageIds
    const response = await MetricsService.getMetaMetricsPersons({ villageIds, personVillageIds, start, end })
    res.json(response)
  }
  catch (err) {
    next(err)
  }
}
