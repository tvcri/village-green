'use strict';
const { memberDropReasons } = require('../service/VolunteerCatalogService')
const makeDropReasonController = require('./makeDropReasonController')

const controller = makeDropReasonController(memberDropReasons, 'memberDropReasonId')

module.exports.getMemberDropReasons = controller.list
module.exports.createMemberDropReason = controller.create
module.exports.patchMemberDropReason = controller.patch
module.exports.deleteMemberDropReason = controller.remove
