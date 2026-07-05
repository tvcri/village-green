'use strict';
const dbUtils = require('./utils')

module.exports.getCommunities = async function (personId) {
  const [rows] = await dbUtils.pool.query(
    `SELECT CAST(c.id AS CHAR) AS communityId, c.name
       FROM person_community pc
       JOIN community c ON c.id = pc.communityId
      WHERE pc.personId = ?
      ORDER BY c.name`,
    [personId]
  )
  return rows
}

// Full-array replace of a person's community memberships.
module.exports.putCommunities = async function (personId, { communityIds = [] } = {}) {
  await dbUtils.retryOnDeadlock2({
    transactionFn: async (connection) => {
      await connection.query('DELETE FROM person_community WHERE personId = ?', [personId])
      if (communityIds.length) {
        const values = communityIds.map(id => [personId, id])
        await connection.query(
          'INSERT INTO person_community (personId, communityId) VALUES ?', [values]
        )
      }
    },
    statusObj: undefined
  })
  return await module.exports.getCommunities(personId)
}

module.exports.getAllCommunities = async function () {
  const [rows] = await dbUtils.pool.query(
    'SELECT CAST(id AS CHAR) AS communityId, name FROM community ORDER BY name'
  )
  return rows
}
