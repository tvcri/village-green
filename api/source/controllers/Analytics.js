'use strict'

const AnalyticsService = require('../service/AnalyticsService')
const SmError = require('../utils/error.js')

module.exports.postEvents = async function (req, res, next) {
  try {
    const userId = req.userObject.userId
    const events = req.body
    await AnalyticsService.postEvents(userId, events)
    res.status(204).end()
  }
  catch (err) {
    next(err)
  }
}

module.exports.getSummary = async function (req, res, next) {
  try {
    if (!req.userObject.privileges?.admin) throw new SmError.PrivilegeError()
    const { from, to, userId } = req.query
    const summary = await AnalyticsService.getSummary({ from, to, userId })
    res.json(summary)
  }
  catch (err) {
    next(err)
  }
}
