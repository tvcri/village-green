'use strict';

const SmError = require('../utils/error')
const FriendService = require('../service/FriendService')
const { hasPermission } = require('../utils/authz')

module.exports.getFriends = async function getFriends (req, res, next) {
  try {
    const { villageId, volunteerPersonId, memberPersonId, dateStart, dateEnd, contactType, activityType, volunteerName, memberName } = req.query
    if (villageId?.length) {
      if (!villageId.every(vid => hasPermission(req.userObject, 'friend:read', { villageId: vid }))) {
        throw new SmError.PrivilegeError()
      }
    }
    else if (!hasPermission(req.userObject, 'friend:read')) {
      // No village filter = federation-wide query: requires a federation read.
      throw new SmError.PrivilegeError()
    }
    const villageIdsGranted = hasPermission(req.userObject, 'friend:read')
      ? null // federation read: unrestricted
      : Object.keys(req.userObject.grants).filter(
          vid => hasPermission(req.userObject, 'friend:read', { villageId: vid })
        )
    const response = await FriendService.getFriends({
      villageIdsGranted,
      villageId,
      volunteerPersonId,
      memberPersonId,
      dateStart,
      dateEnd,
      contactType,
      activityType,
      volunteerName,
      memberName
    })
    res.json(response)
  }
  catch (err) {
    next(err)
  }
}
