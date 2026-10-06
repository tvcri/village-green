'use strict'
const dbUtils = require('./utils')
const SmError = require('../utils/error')
const AuditService = require('./audit/AuditService')

// The two staff-owned volunteer catalogs (trainings, positions) behave the
// same apart from position.scope, so one factory serves both. Holder counts
// are always included: the admin page needs them to explain a 409 before
// the user clicks (spec §4.1).
function makeCatalog ({ table, idName, junction, entityType, hasScope, label }) {
  const t = `\`${table}\``
  const columns = [
    `CAST(c.id AS CHAR) AS ${idName}`, 'c.name', 'c.description',
    ...(hasScope ? ['c.scope'] : []),
    `(SELECT COUNT(DISTINCT j.volunteerId) FROM \`${junction}\` j WHERE j.${entityType}Id = c.id) AS holderCount`,
  ].join(', ')

  async function holderCount (connection, id) {
    const [[row]] = await connection.query(
      `SELECT COUNT(DISTINCT volunteerId) AS n FROM \`${junction}\` WHERE ${entityType}Id = ?`, [id])
    return row.n
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
      try {
        return await dbUtils.retryOnDeadlock2({
          transactionFn: (connection) => AuditService.auditUpdate(connection, { entityType, userId },
            async () => {
              const [res] = await connection.query(`INSERT INTO ${t} SET ?`, fields)
              return res.insertId
            }),
        })
      } catch (err) { rethrowDuplicate(err, body.name) }
    },

    async patch (id, body, userId) {
      const fields = {}
      for (const k of ['name', 'description', ...(hasScope ? ['scope'] : [])]) {
        if (body[k] !== undefined) fields[k] = body[k]
      }
      try {
        await dbUtils.retryOnDeadlock2({
          transactionFn: async (connection) => {
            if (fields.scope !== undefined) {
              const [[cur]] = await connection.query(`SELECT scope FROM ${t} WHERE id = ?`, [id])
              const n = await holderCount(connection, id)
              if (cur && cur.scope !== fields.scope && n > 0) {
                throw new SmError.ConflictError(
                  `This ${label} is held by ${n} volunteer(s); its scope can't change until they are unassigned.`)
              }
            }
            await AuditService.auditUpdate(connection, { entityType, entityId: id, userId },
              () => connection.query(`UPDATE ${t} SET ? WHERE id = ?`, [fields, id]))
            return id
          },
        })
      } catch (err) { rethrowDuplicate(err, body.name) }
    },

    async remove (id, userId) {
      await dbUtils.retryOnDeadlock2({
        transactionFn: async (connection) => {
          const n = await holderCount(connection, id)
          if (n > 0) {
            throw new SmError.ConflictError(
              `This ${label} is held by ${n} volunteer(s). Remove it from them first, or rename it instead.`)
          }
          await AuditService.auditDelete(connection, { entityType, entityId: id, userId },
            () => connection.query(`DELETE FROM ${t} WHERE id = ?`, [id]))
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
