'use strict';
const dbUtils = require('./utils')

module.exports.getAllLanguages = async function () {
  const [rows] = await dbUtils.pool.query(
    'SELECT CAST(id AS CHAR) AS languageId, name, tag FROM language ORDER BY name'
  )
  return rows
}
