'use strict';

const SmError = require('../utils/error')
const FriendService = require('../service/FriendService')

module.exports.getFriends = async function getFriends (req, res, next) {
  try {
    const elevate = req.query.elevate
    if (elevate && !req.userObject.privileges?.admin) {
      throw new SmError.PrivilegeError()
    }
    const { villageId, volunteerPersonId, memberPersonId, dateStart, dateEnd, contactType, activityType } = req.query
    const villageIdsGranted = Object.keys(req.userObject.grants)
    const response = await FriendService.getFriends({
      villageIdsGranted,
      elevate,
      villageId,
      volunteerPersonId,
      memberPersonId,
      dateStart,
      dateEnd,
      contactType,
      activityType
    })
    res.json(response)
  }
  catch (err) {
    next(err)
  }
}
