'use strict';
const dbUtils = require('./utils')

module.exports.getCommunities = async function (personId) {
  const [rows] = await dbUtils.pool.query(
    `SELECT CAST(c.id AS CHAR) AS communityId, c.name
       FROM person_community pc
       JOIN community c ON c.id = pc.community_id
      WHERE pc.person_id = ?
      ORDER BY c.name`,
    [personId]
  )
  return rows
}

// Full-array replace of a person's community memberships.
module.exports.putCommunities = async function (personId, { communityIds = [] } = {}) {
  await dbUtils.retryOnDeadlock2({
    transactionFn: async (connection) => {
      await connection.query('DELETE FROM person_community WHERE person_id = ?', [personId])
      if (communityIds.length) {
        const values = communityIds.map(id => [personId, id])
        await connection.query(
          'INSERT INTO person_community (person_id, community_id) VALUES ?', [values]
        )
      }
    },
    statusObj: undefined
  })
  return await module.exports.getCommunities(personId)
}
