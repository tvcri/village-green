'use strict';
const dbUtils = require('./utils')

module.exports.getAllContactMethods = async function () {
  const [rows] = await dbUtils.pool.query(
    'SELECT CAST(id AS CHAR) AS contactMethodId, name FROM contact_method ORDER BY id'
  )
  return rows
}
