'use strict';
const LanguageService = require('../service/LanguageService')

module.exports.getLanguages = async function getLanguages (req, res, next) {
  try {
    const response = await LanguageService.getAllLanguages()
    res.json(response)
  }
  catch (err) { next(err) }
}
