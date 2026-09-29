'use strict';
const dbUtils = require('./utils')

module.exports.getAllRaces = async function () {
  const [rows] = await dbUtils.pool.query(
    'SELECT CAST(id AS CHAR) AS raceId, name FROM race ORDER BY name'
  )
  return rows
}
