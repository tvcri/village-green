'use strict'
const dbUtils = require('./utils')
const SmError = require('../utils/error')
const AuditService = require('./audit/AuditService')
const { assertIdsExist, positionShownSql } = require('./volunteerAssignments')

// The three catalogs (trainings, positions, member drop reasons; written only by
// Admin's '*') behave the same apart from position.scope and the member-reason
// holder count, so one factory serves all of them. Holder counts
// are always included: the admin page needs them to explain a 409 before
// the user clicks (spec §4.1). For positions, holderCount counts the holders
// the position page shows and inactiveHolderCount the hidden ones; both still
// block a delete or a scope change.
//
// `memberHolders` swaps the volunteer-junction holder count for a custom one
// (the member drop-reasons catalog): { countSql, idSql, noun }. countSql is a
// correlated scalar subquery on c.id; idSql takes one bind (the id) and returns
// n. A catalog with `retired` also accepts that flag on create and patch.
function makeCatalog ({ table, idName, junction, entityType, hasScope, label, memberHolders, hasRetired }) {
  const t = `\`${table}\``
  const countHolders = (where) => `(SELECT COUNT(DISTINCT j.volunteerId) FROM \`${junction}\` j
    JOIN volunteer v ON v.id = j.volunteerId WHERE j.${entityType}Id = c.id AND ${where})`
  const columns = [
    `CAST(c.id AS CHAR) AS ${idName}`, 'c.name', 'c.description',
    ...(hasScope ? ['c.scope'] : []),
    ...(hasRetired ? ['c.retired'] : []),
    ...(memberHolders ? [`${memberHolders.countSql} AS holderCount`] : hasScope
      ? [`${countHolders(positionShownSql('v'))} AS holderCount`, `${countHolders(`NOT ${positionShownSql('v')}`)} AS inactiveHolderCount`]
      : [`${countHolders('TRUE')} AS holderCount`]),
    // Trainings only: newest dated completion, unscoped like holderCount.
    ...(hasScope || memberHolders ? [] : ["(SELECT DATE_FORMAT(MAX(vt.completedDate), '%Y-%m-%d') FROM volunteer_training vt WHERE vt.trainingId = c.id) AS lastCompletedDate"]),
    // Positions only: the trainings expected before assignment (UI spec §2.3).
    ...(hasScope ? [`COALESCE((SELECT JSON_ARRAYAGG(CAST(pt.trainingId AS CHAR)) FROM position_training pt WHERE pt.positionId = c.id), JSON_ARRAY()) AS trainingIds`] : []),
  ].join(', ')

  // Every holder, shown or hidden, as the phrase a 409 uses.
  async function holders (connection, id) {
    if (memberHolders) {
      const [[r]] = await connection.query(memberHolders.idSql, [id])
      return { n: r.n, phrase: `${r.n} ${memberHolders.noun}(s)` }
    }
    const [[row]] = await connection.query(
      `SELECT COUNT(DISTINCT j.volunteerId) AS n${hasScope ? `, COUNT(DISTINCT IF(${positionShownSql('v')}, NULL, j.volunteerId)) AS hidden` : ''}
       FROM \`${junction}\` j JOIN volunteer v ON v.id = j.volunteerId WHERE j.${entityType}Id = ?`, [id])
    return { n: row.n, phrase: `${row.n} volunteer(s)${row.hidden ? `, ${row.hidden} of them inactive` : ''}` }
  }

  // Full replace of a position's expected trainings. Runs inside the
  // caller's auditUpdate so the position's `trainings` set diff sees it.
  async function replaceTrainingLinks (connection, id, trainingIds) {
    const ids = [...new Set(trainingIds.map(String))]
    await assertIdsExist(connection, 'training', 'trainingId', ids)
    await connection.query('DELETE FROM position_training WHERE positionId = ?', [id])
    if (ids.length) {
      await connection.query('INSERT INTO position_training (positionId, trainingId) VALUES ?', [ids.map(t => [id, t])])
    }
  }

  function rethrowDuplicate (err, name) {
    if (err.code === 'ER_DUP_ENTRY') {
      throw new SmError.ConflictError(`A ${label} named "${name}" already exists.`)
    }
    throw err
  }

  return {
    async list () {
      const [rows] = await dbUtils.pool.query(`SELECT ${columns} FROM ${t} c ORDER BY c.name`)
      return rows
    },

    async get (id) {
      const [rows] = await dbUtils.pool.query(`SELECT ${columns} FROM ${t} c WHERE c.id = ?`, [id])
      return rows[0] ?? null
    },

    async create (body, userId) {
      const fields = { name: body.name, description: body.description ?? null }
      if (hasScope) fields.scope = body.scope
      if (hasRetired) fields.retired = body.retired ?? false
      try {
        return await dbUtils.retryOnDeadlock2({
          transactionFn: (connection) => AuditService.auditUpdate(connection, { entityType, userId },
            async () => {
              const [res] = await connection.query(`INSERT INTO ${t} SET ?`, fields)
              if (hasScope && body.trainingIds?.length) await replaceTrainingLinks(connection, res.insertId, body.trainingIds)
              return res.insertId
            }),
        })
      } catch (err) { rethrowDuplicate(err, body.name) }
    },

    async patch (id, body, userId) {
      const fields = {}
      for (const k of ['name', 'description', ...(hasScope ? ['scope'] : []), ...(hasRetired ? ['retired'] : [])]) {
        if (body[k] !== undefined) fields[k] = body[k]
      }
      try {
        await dbUtils.retryOnDeadlock2({
          transactionFn: async (connection) => {
            if (fields.scope !== undefined) {
              const [[cur]] = await connection.query(`SELECT scope FROM ${t} WHERE id = ?`, [id])
              const h = await holders(connection, id)
              if (cur && cur.scope !== fields.scope && h.n > 0) {
                throw new SmError.ConflictError(
                  `This ${label} is held by ${h.phrase}; its scope can't change until they are unassigned.`)
              }
            }
            await AuditService.auditUpdate(connection, { entityType, entityId: id, userId },
              async () => {
                if (Object.keys(fields).length) await connection.query(`UPDATE ${t} SET ? WHERE id = ?`, [fields, id])
                if (hasScope && body.trainingIds !== undefined) await replaceTrainingLinks(connection, id, body.trainingIds)
              })
            return id
          },
        })
      } catch (err) { rethrowDuplicate(err, body.name) }
    },

    async remove (id, userId) {
      await dbUtils.retryOnDeadlock2({
        transactionFn: async (connection) => {
          const h = await holders(connection, id)
          if (h.n > 0) {
            throw new SmError.ConflictError(
              `This ${label} is held by ${h.phrase}. Remove it from them first, or rename it instead.`)
          }
          // Deleting a training cascades its position_training links, which
          // changes each linked position's audited trainings set: record it
          // on those positions too.
          const [linked] = hasScope || memberHolders ? [[]] : await connection.query(
            'SELECT positionId FROM position_training WHERE trainingId = ?', [id])
          await AuditService.auditDelete(connection, { entityType, entityId: id, userId },
            () => AuditService.auditFanOut(connection, { entityType: 'position', entityIds: linked.map(r => r.positionId), userId },
              () => connection.query(`DELETE FROM ${t} WHERE id = ?`, [id])))
          return id
        },
      })
    },
  }
}

module.exports.trainings = makeCatalog({
  table: 'training', idName: 'trainingId', junction: 'volunteer_training',
  entityType: 'training', hasScope: false, label: 'training',
})
module.exports.positions = makeCatalog({
  table: 'position', idName: 'positionId', junction: 'volunteer_position',
  entityType: 'position', hasScope: true, label: 'position',
})
module.exports.memberDropReasons = makeCatalog({
  table: 'member_drop_reason', idName: 'memberDropReasonId', entityType: 'member_drop_reason',
  hasScope: false, hasRetired: true, label: 'drop reason',
  memberHolders: {
    noun: 'member',
    countSql: '(SELECT COUNT(*) FROM member m WHERE m.dropReasonId = c.id)',
    idSql: 'SELECT COUNT(*) AS n FROM member WHERE dropReasonId = ?',
  },
})
