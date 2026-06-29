const logger = require('../../utils/logger')
const path = require('node:path')

const migrationName = path.basename(__filename, '.js')

const upFn = async (pool) => {
  const connection = await pool.getConnection()
  try {
    await connection.query(
      `CREATE OR REPLACE VIEW active_member AS
         SELECT * FROM member WHERE status = 'Active'`
    )
    await connection.query(
      `CREATE OR REPLACE VIEW active_volunteer AS
         SELECT * FROM volunteer WHERE active = 1`
    )
  } finally {
    await connection.release()
  }
}

const downFn = async (pool) => {
  const connection = await pool.getConnection()
  try {
    await connection.query(`DROP VIEW IF EXISTS active_volunteer`)
    await connection.query(`DROP VIEW IF EXISTS active_member`)
  } finally {
    await connection.release()
  }
}

module.exports = {
  up: async (pool) => {
    try {
      logger.writeInfo('mysql', 'migration', { status: 'start', direction: 'up', migrationName })
      await upFn(pool)
      logger.writeInfo('mysql', 'migration', { status: 'finish', migrationName })
    } catch (e) {
      logger.writeError('mysql', 'migration', { status: 'error', migrationName, message: e.message })
      throw e
    }
  },
  down: async (pool) => {
    try {
      logger.writeInfo('mysql', 'migration', { status: 'start', direction: 'down', migrationName })
      await downFn(pool)
      logger.writeInfo('mysql', 'migration', { status: 'finish', migrationName })
    } catch (e) {
      logger.writeError('mysql', 'migration', { status: 'error', migrationName, message: e.message })
      throw e
    }
  }
}
