'use strict'

const SmError = require('../utils/error')
const VillageService = require('../service/VillageService')
const ApplicationImportService = require('../service/ApplicationImportService')
const { hasPermission } = require('../utils/authz')

module.exports.extractApplication = async function extractApplication (req, res, next) {
  try {
    // Extraction feeds the person-import flow and each call bills Anthropic
    // tokens — gate before any file handling. Federation-scoped: import has
    // no village context until the operator resolves one from the PDF.
    if (!hasPermission(req.userObject, 'person:write')) {
      throw new SmError.PrivilegeError()
    }
    if (!req.file) {
      throw new SmError.ClientError('No file provided. Attach a PDF as the importFile field.')
    }
    if (req.file.mimetype !== 'application/pdf') {
      throw new SmError.ClientError('File must be a PDF.')
    }
    // Anthropic requests cap at 32MB and base64 inflates by 4/3 — reject early.
    if (req.file.size > 20 * 1024 * 1024) {
      throw new SmError.ClientError('PDF exceeds the 20MB limit for extraction.')
    }
    const { data, usage } = await ApplicationImportService.extractFromPdf(req.file.buffer)
    // queryVillages returns [] unless allVillages/grants bypass its grant-based
    // filter; village resolution here needs the full list regardless of the
    // operator's own village grants.
    const villages = await VillageService.queryVillages({ allVillages: true })
    res.json(ApplicationImportService.assembleResponse(data, villages, usage))
  }
  catch (err) {
    next(err)
  }
}
