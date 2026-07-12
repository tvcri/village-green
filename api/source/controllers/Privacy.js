'use strict'

const SmError = require('../utils/error')
const PrivacyService = require('../service/PrivacyService')
const config = require('../utils/config')
const { hasElevatedPermission } = require('../utils/authz')

function filterTokenClaims(tokenPayload) {
  const { sub, iss, iat, exp } = tokenPayload
  const nameClaim = config.oauth.claims.name
  const emailClaim = config.oauth.claims.email
  const claims = { sub, iss, iat, exp }
  if (nameClaim && tokenPayload[nameClaim] !== undefined) claims[nameClaim] = tokenPayload[nameClaim]
  if (emailClaim && tokenPayload[emailClaim] !== undefined) claims[emailClaim] = tokenPayload[emailClaim]
  return claims
}

module.exports.getPrivacyRules = async function getPrivacyRules(req, res, next) {
  try {
    const rules = await PrivacyService.getPrivacyRules()
    if (!rules) throw new SmError.NotFoundError()
    res.json(rules)
  }
  catch (err) {
    next(err)
  }
}

module.exports.publishPrivacyRules = async function publishPrivacyRules(req, res, next) {
  try {
    if (!hasElevatedPermission(req.userObject, 'app:admin', req)) throw new SmError.PrivilegeError()
    const tokenClaims = filterTokenClaims(req.access_token)
    const rules = await PrivacyService.publishPrivacyRules(req.body.content, req.userObject.userId, tokenClaims)
    res.status(201).json(rules)
  }
  catch (err) {
    next(err)
  }
}

module.exports.patchPrivacyRulesCurrent = async function patchPrivacyRulesCurrent(req, res, next) {
  try {
    if (!hasElevatedPermission(req.userObject, 'app:admin', req)) throw new SmError.PrivilegeError()
    const rules = await PrivacyService.patchPrivacyRulesCurrent(req.body.content, req.userObject.userId)
    if (!rules) throw new SmError.NotFoundError()
    res.json(rules)
  }
  catch (err) {
    next(err)
  }
}

module.exports.createPrivacyAcknowledgement = async function createPrivacyAcknowledgement(req, res, next) {
  try {
    const tokenClaims = filterTokenClaims(req.access_token)
    const ack = await PrivacyService.createPrivacyAcknowledgement(
      req.userObject.userId,
      req.body.rulesId,
      tokenClaims
    )
    res.status(201).json(ack)
  }
  catch (err) {
    next(err)
  }
}
