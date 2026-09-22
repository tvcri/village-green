'use strict';
const dbUtils = require('./utils')

module.exports.getAllGenders = async function () {
  const [rows] = await dbUtils.pool.query(
    'SELECT CAST(id AS CHAR) AS genderId, name FROM gender ORDER BY id'
  )
  return rows
}
