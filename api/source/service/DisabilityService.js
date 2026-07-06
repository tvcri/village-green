'use strict';
const dbUtils = require('./utils')

module.exports.getAllDisabilities = async function () {
  const [rows] = await dbUtils.pool.query(
    `SELECT CAST(id AS CHAR) AS disabilityId, name FROM disability
     WHERE name IN ('Vision', 'Walker', 'Hearing', 'Wheelchair', 'Cane')
     ORDER BY name`
  )
  return rows
}
