'use strict';
const dbUtils = require('./utils')

module.exports.getAllCapabilities = async function () {
  const [rows] = await dbUtils.pool.query(
    'SELECT CAST(id AS CHAR) AS capabilityId, name FROM capability ORDER BY name'
  )
  return rows
}
