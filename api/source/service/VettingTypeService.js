'use strict';
const dbUtils = require('./utils')

module.exports.getAllVettingTypes = async function () {
  const [rows] = await dbUtils.pool.query(
    'SELECT CAST(id AS CHAR) AS vettingTypeId, name FROM vetting_type ORDER BY name'
  )
  return rows
}
