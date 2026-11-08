'use strict';
const dbUtils = require('./utils')
const PersonService = require('./PersonService')
const AuditService = require('./audit/AuditService')

// Record or fully replace the donor association. LGL is the source of truth,
// so the body is the whole record.
module.exports.putDonor = async function (personId, body, userObject) {
  const fields = { lglConstituentId: body.lglConstituentId, lastGiftDate: body.lastGiftDate ?? null }
  await dbUtils.retryOnDeadlock2({
    transactionFn: async (connection) => {
      // FOR UPDATE: two first-time PUTs for one person would otherwise both
      // see no row and both INSERT; the locks turn that into a deadlock,
      // which retryOnDeadlock2 retries as an update.
      const [existing] = await connection.query('SELECT id FROM donor WHERE personId = ? FOR UPDATE', [personId])
      await AuditService.auditUpdate(connection,
        { entityType: 'donor', entityId: existing[0]?.id ?? null, userId: userObject.userId },
        async () => {
          if (existing.length) {
            await connection.query('UPDATE donor SET ? WHERE personId = ?', [fields, personId])
            return undefined
          }
          const [result] = await connection.query('INSERT INTO donor SET ?', { personId, ...fields })
          return result.insertId
        })
    },
    statusObj: undefined
  })
  return await PersonService.getPerson(personId, ['donor'], userObject)
}

// Returns whether a donor row was removed (false: the person is not a donor).
module.exports.deleteDonor = async function (personId, userId) {
  return dbUtils.retryOnDeadlock2({
    transactionFn: async (connection) => {
      const [rows] = await connection.query('SELECT id FROM donor WHERE personId = ? FOR UPDATE', [personId])
      const donorId = rows[0]?.id
      if (!donorId) return false
      await AuditService.auditDelete(connection, { entityType: 'donor', entityId: donorId, userId },
        () => connection.query('DELETE FROM donor WHERE personId = ?', [personId]))
      return true
    },
  })
}
