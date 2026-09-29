'use strict';
const ContactMethodService = require('../service/ContactMethodService')

module.exports.getContactMethods = async function getContactMethods (req, res, next) {
  try {
    const response = await ContactMethodService.getAllContactMethods()
    res.json(response)
  }
  catch (err) { next(err) }
}
