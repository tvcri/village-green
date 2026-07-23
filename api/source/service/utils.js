const mysql = require('mysql2/promise')
const config = require('../utils/config')
const logger = require('../utils/logger')
const retry = require('async-retry')
const Umzug = require('umzug')
const path = require('path')
const fs = require("fs")
const semverGte = require('semver/functions/gte')
const semverCoerce = require('semver/functions/coerce')
const Importer = require('./migrations/lib/mysql-import.js')
const state = require('../utils/state')
const minMySqlVersion = '8.0.24'
let _this = this
let initAttempt = 0
let NetKeepAlive
if (!process.pkg) {
  // pkg does not support the dynamic loading used by net-keepalive.
  // Therefore, support for TCP_USER_TIMEOUT is excluded from binaries built with pkg.
  NetKeepAlive = require('net-keepalive')
}
const PoolMonitor = require('../utils/PoolMonitor.js')

/**
 * Performs a preflight connection check by getting and releasing a connection from the pool.
 */
async function preflightConnection () {
  logger.writeDebug('mysql', 'preflight', { attempt: ++initAttempt })
  const connection = await _this.pool.getConnection()
  await connection.release()
}

/**
 * Retrieves the MySQL version from the database.
 * @returns {Promise<string>} The MySQL version.
 */
async function getMySqlVersion () {
  let [result] = await _this.pool.query('SELECT VERSION() as version')
  return result[0].version
}

/**
 * Retrieves the count of tables in the database.
 * @returns {Promise<number>} The number of tables.
 */
async function getTableCount () {
  let [tables] = await _this.pool.query('SHOW TABLES')
  return tables.length
}

/**
 * Checks if the provided MySQL version is acceptable.
 * @param {string} version - The MySQL version to check.
 * @returns {boolean} True if the version is acceptable, false otherwise.
 */
function isOkVersion(version) {
  return semverGte(semverCoerce(version), semverCoerce(minMySqlVersion))
}

/**
 * Performs database migrations using Umzug.
 * @returns {Promise<Array>} The list of executed migrations.
 */
async function doMigrations() {
  // Perform migrations
  const umzug = new Umzug({
    migrations: {
      path: path.join(__dirname, './migrations'),
      params: [_this.pool]
    },
    storage: path.join(__dirname, './migrations/lib/umzug-mysql-storage'),
    storageOptions: {
      pool: _this.pool
    }
  })

  if (config.database.revert) {
    const migrations = await umzug.executed()
    if (migrations.length) {
      logger.writeInfo('mysql', 'migration', { message: 'MySQL schema will revert the last migration and terminate' })
      await umzug.down()
    } else {
      logger.writeInfo('mysql', 'migration', { message: 'MySQL schema has no migrations to revert' })
    }
    logger.writeInfo('mysql', 'migration', { message: 'MySQL revert migration has completed' })
    state.setState('stop')
  }
  const migrations = await umzug.pending()
  if (migrations.length > 0) {
    logger.writeInfo('mysql', 'migration', { message: `MySQL schema requires ${migrations.length} update${migrations.length > 1 ? 's' : ''}` })
    await umzug.up()
    logger.writeInfo('mysql', 'migration', { message: `All migrations performed successfully` })
  }
  else {
    logger.writeInfo('mysql', 'migration', { message: `MySQL schema is up to date` })
  }
  return umzug.executed()
}

/**
 * Sets up the initial database schema by importing SQL files.
 */
async function setupInitialSchema(){
  logger.writeInfo('mysql', 'schema', { message: 'setting up new schema.' })
  const importer = new Importer(_this.pool)
  const dir = path.join(__dirname, 'migrations', 'sql', 'current')
  // Apply in filename order (10-, 20-, 30-, ...); readdir order is not guaranteed.
  const files = (await fs.promises.readdir(dir)).sort()
  try {
    for (const file of files) {
      logger.writeInfo('mysql', 'schema', {status: 'running', name: file })
      await importer.import(path.join(dir, file))
    }    
  }
  catch (e) {
    logger.writeError('mysql', 'schema', {status: 'error', files, message: e.message })
    throw new Error(`failed to setup initial schema, ${e.message}`)
  }
  logger.writeInfo('mysql', 'schema', { message: 'schema setup complete.' })
}

/**
 * Sets up the database schema by checking the number of tables and performing migrations if necessary.
 */
async function setupSchema() {
  try {
    // Check the number of tables in the database
    const numTables = await getTableCount()

    if (numTables === 0) {
      await setupInitialSchema()
    }
    const migrated = await doMigrations()
    config.lastMigration = migrated.length ? parseInt(migrated[migrated.length -1].file.substring(0,4)) : 0
  }
  catch (error) {
    logger.writeError('mysql', 'initalization', { message: error.message })
    throw new Error('Failed during database initialization or migration.')
  } 
}

/**
 * Resolves a database TLS certificate path.
 * Detects if the path is absolute or relative and returns the appropriate resolved path.
 * Relative paths are resolved relative to the /tls directory for backward compatibility.
 * 
 * @param {string} certPath - The certificate path from configuration
 * @returns {string} The resolved absolute path
 */
function resolveDbCertPath(certPath) {
  if (path.isAbsolute(certPath)) {
    // Path is already absolute, use it directly
    return certPath
  } else {
    // Path is relative, resolve it relative to the /tls directory (legacy behavior)
    return path.join(__dirname, '..', 'tls', certPath)
  }
}

/**
 * Generates the pool configuration object based on the application configuration.
 * @returns {Object} The pool configuration object.
 */
function getPoolConfig() {
  const poolConfig = {
    connectionLimit : config.database.maxConnections,
    timezone: 'Z',
    host: config.database.host,
    port: config.database.port,
    user: config.database.username,
    database: config.database.schema,
    decimalNumbers: true,
    charset: 'utf8mb4_0900_ai_ci',
    keepAliveInitialDelay: 10000,
    connectAttributes: {
      program_name: 'village-green'
    },
    typeCast: function (field, next) {
      if ((field.type === "BIT") && (field.length === 1)) {
        let bytes = field.buffer() || [0]
        return( bytes[ 0 ] === 1 )
      }
      return next()
    } 
  }
  if (config.database.password) {
    poolConfig.password = config.database.password
  }
  if (config.database.tls.ca_file || config.database.tls.cert_file || config.database.tls.key_file) {
    const sslConfig = {}
    if (config.database.tls.ca_file) {
      sslConfig.ca = fs.readFileSync(resolveDbCertPath(config.database.tls.ca_file))
    }
    if (config.database.tls.cert_file) {
      sslConfig.cert = fs.readFileSync(resolveDbCertPath(config.database.tls.cert_file))
    }
    if (config.database.tls.key_file) {
      sslConfig.key = fs.readFileSync(resolveDbCertPath(config.database.tls.key_file))
    }
    poolConfig.ssl = sslConfig
  }
  return poolConfig
}

/**
 * Patches the pool to emit a 'remove' event when a connection is removed.
 * @param {Object} promisePool - The mysql2 PromisePool object.
 */
function patchRemoveConnection(promisePool) {
  const originalRemoveConnection = promisePool.pool._removeConnection
  promisePool.pool._removeConnection = function (connection) {
    originalRemoveConnection.call(promisePool.pool, connection)
    promisePool.emit('remove', connection)
  }
}

/**
 * Retry function for the pool monitor to attempt to restore pool connections.
 */
async function poolMonitorRetryFn () {
  try {
    logger.writeInfo('mysql', 'restore', { message: 'attempting to restore pool connection' })
    await preflightConnection()
    logger.writeInfo('mysql', 'restore', { message: `connection suceeded` })
    const version = await getMySqlVersion()
    if (!isOkVersion(version)) {
      const connection = await _this.pool.getConnection()
      connection.connection.destroy()
      throw new Error(`MySQL release ${version} is too old. Update to release ${minMySqlVersion} or later.`)
    } 
    else {
      await setupSchema()
      logger.writeInfo('mysql', 'restore', { success: true, version, message: 'pool connection restored' })
    } 
  }
  catch (e) {
    logger.writeError('mysql', 'restore', { success: false, message: e.message })
    throw e
  }
}

/**
 * Retry function for bootstrapping the database connection.
 * @param {Function} fn - The function to retry.
 * @returns {Promise} The result of the retried function.
 */
async function bootstrapRetryFn (fn) {
  return retry(fn, {
    retries: config.settings.dependencyRetries,
    factor: 1,
    minTimeout: 5 * 1000,
    maxTimeout: 5 * 1000,
    onRetry: (error) => {
      logger.writeError('mysql', 'preflight', { success: false, message: error.message })
    }
  })
}

/**
 * Formats a Node.js socket object into a string representation.
 * 
 * @param {net.Socket} socket - The Node.js socket object.
 * @returns {string|undefined} A string representation of the socket's local and remote addresses and ports, or undefined if the socket is not connected.
 */
function formatSocket(socket) {
  return socket.localAddress ? `${socket.localAddress}:${socket.localPort} -> ${socket.remoteAddress}:${socket.remotePort}` : undefined
}

/**
 * Attaches event handlers to the pool for connection and removal events.
 * @param {Object} pool - The mysql2 PromisePool object.
 */
function attachPoolEventHandlers(pool) {
  pool.on('connection', function (connection) {
    const socket = formatSocket(connection.stream)
    connection.on('error', function (error) {
      logger.writeError('mysql', 'connectionEvent', { event: 'error', socket, message: error.message })
    })
    logger.writeInfo('mysql', 'poolEvent', { event: 'connection', socket })
    NetKeepAlive?.setUserTimeout(connection.stream, 20000)
    connection.query('SET SESSION group_concat_max_len=10000000')
  })
  pool.on('remove', function (connection) {
    const socket = formatSocket(connection.stream)
    logger.writeInfo('mysql', 'poolEvent', { event: 'remove', socket, remaining: pool.pool._allConnections.toArray().length, authorized: connection.authorized })
  })  
}

module.exports.initializeDatabase = async function () {
  try {
    // Create the connection pool
    const poolConfig = getPoolConfig()
    logger.writeDebug('mysql', 'poolConfig', { ...poolConfig })

    _this.pool = mysql.createPool(poolConfig)
    attachPoolEventHandlers(_this.pool)

    new PoolMonitor({pool: _this.pool, state, retryInterval: 20000, retryFn: poolMonitorRetryFn})
    state.dbPool = _this.pool

    // Try to create a pool connection, will retry every 5 seconds
    await bootstrapRetryFn(preflightConnection)

    // Check the MySQL version
    const version = await getMySqlVersion()
    if (!isOkVersion(version)) {
      logger.writeError('mysql', 'preflight', { success: false, message: `MySQL release ${version} is too old. Update to release ${minMySqlVersion} or later.` })
      throw new Error('MySQL release is too old.')
    } 
    else {
      logger.writeInfo('mysql', 'preflight', {success: true, version })
    }

    // Patch the pool to emit a 'remove' event when a connection is removed
    patchRemoveConnection(_this.pool)

    // Setup the schema, will scaffold if necessary and run migrations
    await setupSchema()

    state.setDbStatus(true)
  }
  catch (err) {
    state.setDbStatus(false)
    throw err
  }
}

module.exports.uuidToSqlString  = function (uuid) {
  return {
    toSqlString: function () {
      return `UUID_TO_BIN(${mysql.escape(uuid)},1)`
    }
  }
}

module.exports.makeQueryString = function ({ctes = [], hints= [], columns, joins, predicates, groupBy, orderBy, format = false}) {
  if (joins instanceof Set) joins = Array.from(joins)
  if (groupBy instanceof Set) groupBy = Array.from(groupBy)
  const query = `${ctes.length ? 'WITH ' + ctes.join(',  \n') : ''}
SELECT ${hints.length ? '/*+ ' + hints.join(' ') + '*/' : ''}
  ${columns.join(',\n  ')}
FROM
  ${joins.join('\n  ')}
${predicates?.statements.length ? 'WHERE\n  ' + predicates.statements.join(' and\n  ') : ''}
${groupBy?.length ? 'GROUP BY\n  ' + groupBy.join(',\n  ') : ''}
${orderBy?.length ? 'ORDER BY\n  ' + orderBy.join(',\n  ') : ''}
`
  return format? mysql.format(query, predicates.binds) : query
}

module.exports.WRITE_ACTION = {
  CREATE: 0,
  REPLACE: 1,
  UPDATE: 2
}

module.exports.retryOnDeadlock = async function (fn, statusObj = {}) {
  const retryFunction = async function (bail) {
    try {
      return await fn()
    }
    catch (e) {
      if (e.code === 'ER_LOCK_DEADLOCK') {
        throw(e)
      }
      bail(e)
    }
  }
  statusObj.retries = 0
  return await retry(retryFunction, {
    retries: 15,
    factor: 1,
    minTimeout: 200,
    maxTimeout: 200,
    onRetry: () => {
      ++statusObj.retries
    }
  })
}

module.exports.retryOnDeadlock2 = async function ({ transactionFn, statusObj = {}, beforeReleaseFn, afterRollbackFn}) {
  const connection = await _this.pool.getConnection()
  const retryFunction = async function (bail) {
    try {
      await connection.query('START TRANSACTION')
      const transactionReturn = await transactionFn(connection)
      await connection.commit()
      await connection.release()
      return transactionReturn
    }
    catch (e) {
      if (e.code === 'ER_LOCK_DEADLOCK') {
        throw(e)
      }
      await connection.rollback()
      afterRollbackFn?.(connection)
      beforeReleaseFn?.(connection)
      await connection.release()
      bail(e)
    }
  }
  statusObj.retries = 0
  return  await retry(retryFunction, {
    retries: 15,
    factor: 1,
    minTimeout: 200,
    maxTimeout: 200,
    onRetry: () => {
      ++statusObj.retries
    }
  })
  // return returnValue

}


module.exports.jsonArrayAggDistinct = function (valueStr) {
  return `cast(concat('[', group_concat(distinct ${valueStr}), ']') as json)`
}

module.exports.jsonArrayAgg = function ({value, orderBy = '', distinct = false}) {
  return `cast(concat('[', group_concat(${distinct ? 'distinct ' : ''}${value} ${orderBy ? `order by ${orderBy}` : ''}), ']') as json)`
}

// Runtime VSS identity (set form). Resolves the ACTIVE VOLUNTEERS behind a
// username as a JSON array of person ids ('[]' when none match). person is
// only the email key — one email may map to several persons (shared household
// email), and only those with an active volunteer row are the account's VSS
// identity. Filtering here (not downstream) is the invariant: deactivating a
// volunteer removes them from every surface — list, history, disclosure,
// release — on the next request. DISTINCT guards the out-of-scope
// person-with-multiple-volunteer-rows case. Case-insensitivity comes from the
// utf8mb4_0900_ai_ci collation — no LOWER(), which would defeat person
// INDEX_email. `usernameCol` is a trusted column expression (e.g.
// 'ud.username'), never user input.
module.exports.sqlResolvedPersonIds = function (usernameCol) {
  return `(select cast(concat('[', coalesce(group_concat(distinct av.personId), ''), ']') as json) from person p join active_volunteer av on av.personId = p.id where p.email = ${usernameCol})`
}

// Companion predicate: true iff ANY person behind the username is an active
// volunteer. Same email-match rule as sqlResolvedPersonIds (collation
// case-insensitivity, no LOWER()); used where a boolean beats materializing
// the id array (queryUsers isVolunteer projection).
module.exports.sqlIsActiveVolunteerForUsername = function (usernameCol) {
  return `exists (select 1 from person p join active_volunteer av on av.personId = p.id where p.email = ${usernameCol})`
}

module.exports.sqlGrantees = function ({villageId, villageIds, userId, username, nameMatch, includeColumnVillageId = true, returnCte = false}) {
  const predicates = {
    statements: [],
    binds: []
  }
  if (villageId) {
    predicates.statements.push('cg.villageId = ?')
    predicates.binds.push(villageId)
  }
  if (villageIds) {
    predicates.statements.push('cg.villageId IN (?)')
    predicates.binds.push(villageIds)
  }
  if (userId) {
    predicates.statements.push('ud.userId = ?')
    predicates.binds.push(userId)
  }
  if (username) {
    let matchStr = '= ?'
    if ( nameMatch && nameMatch !== 'exact') {
      matchStr = 'LIKE ?'
      switch (nameMatch) {
        case 'startsWith':
          username = `${username}%`
          break
        case 'endsWith':
          username = `%${username}`
          break
        case 'contains':
          username = `%${username}%`
          break
      }
    }
    predicates.statements.push(`ud.username ${matchStr}`)
    predicates.binds.push(username)
  }

  // Effective grants are the plain union of direct and group-derived rows.
  // VG roles are capabilities, not ranks: no source shadows another and there
  // is no role precedence (see 2026-07-11 effective-grants design spec).
  const sqlDirectGrants = `select
  ${includeColumnVillageId ? 'cg.villageId,' : ''}
  cast(cg.userId as char) as userId,
  cg.roleId,
  cg.grantId
from
  role_grant cg
  inner join village v on (cg.villageId = v.id)
  left join user_data ud on cg.userId = ud.userId
where
    cg.userId is not null
    and cg.villageId is not null
    ${predicates.statements.length ? `and ${predicates.statements.join(' and ')}` : ''}`
  const sqlFormattedDirectGrants = mysql.format(sqlDirectGrants, predicates.binds)

  const sqlGroupGrants = `select
  ${includeColumnVillageId ? 'cg.villageId,' : ''}
  cast(ugu.userId as char) as userId,
  cg.roleId,
  cg.grantId
from
  role_grant cg
  inner join village v on (cg.villageId = v.id)
  inner join user_group_user_map ugu on cg.userGroupId = ugu.userGroupId
  left join user_data ud on ugu.userId = ud.userId
where
    cg.userGroupId is not null
    and cg.villageId is not null
    ${predicates.statements.length ? `and ${predicates.statements.join(' and ')}` : ''}`
  const sqlFormattedGroupGrants = mysql.format(sqlGroupGrants, predicates.binds)

  const sqlFormatted = `${sqlFormattedDirectGrants} union ${sqlFormattedGroupGrants}`
  return returnCte ? `cteGrantees as (${sqlFormatted})` : sqlFormatted
}

module.exports.selectInvalidUserIds = async function (userIds) {
  const sql = `select jt.inUserId as userId,ud.status from
JSON_TABLE(?,'$[*]' COLUMNS( inUserId INT PATH '$')) as jt
left join user_data ud on jt.inUserId = ud.userId
where ud.userId is null or ud.status='unavailable'`
  const [results] = await _this.pool.query(sql, [JSON.stringify(userIds)])
  return results
}
