'use strict';
const dbUtils = require('./utils')

module.exports.getAllCircles = async function () {
  const [rows] = await dbUtils.pool.query(
    'SELECT CAST(id AS CHAR) AS circleId, name FROM circle ORDER BY name'
  )
  return rows
}
