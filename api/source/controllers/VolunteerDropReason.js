'use strict';
const { volunteerDropReasons } = require('../service/VolunteerCatalogService')
const makeDropReasonController = require('./makeDropReasonController')

const controller = makeDropReasonController(volunteerDropReasons, 'volunteerDropReasonId')

module.exports.getVolunteerDropReasons = controller.list
module.exports.createVolunteerDropReason = controller.create
module.exports.patchVolunteerDropReason = controller.patch
module.exports.deleteVolunteerDropReason = controller.remove
