'use strict';
const dbUtils = require('./utils')

module.exports.getAllEthnicities = async function () {
  const [rows] = await dbUtils.pool.query(
    'SELECT CAST(id AS CHAR) AS ethnicityId, name FROM ethnicity ORDER BY id'
  )
  return rows
}
