'use strict';
const dbUtils = require('./utils')

module.exports.getAllCommunities = async function () {
  const [rows] = await dbUtils.pool.query(
    'SELECT CAST(id AS CHAR) AS communityId, name FROM community ORDER BY name'
  )
  return rows
}
