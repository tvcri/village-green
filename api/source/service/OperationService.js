'use strict';
const dbUtils = require('./utils')
const config = require('../utils/config')
const logger = require('../utils/logger')
const BJSON = require('../utils/buffer-json')
const { Readable, Transform } = require("node:stream")
const { pipeline } = require("node:stream/promises")
const zlib = require("node:zlib")
const klona = require('../utils/klona')
const os = require('node:os')
const Umzug = require('umzug')
const path = require('path')

/**
 * Return version information
 *
 * returns ApiVersion
 *
 * NOTE: the STIG-Manager-era `config` key/value table was not carried into
 * the VG schema (see migrations/sql/current). There is currently no
 * persisted config store, so this returns an empty object rather than
 * querying a table that does not exist. Reachable live via GET /op/configuration.
 **/
exports.getConfiguration = async function() {
  return {}
}

/**
 * NOTE: see getConfiguration() above — the `config` table does not exist in
 * the VG schema, so this is a no-op rather than a write to a nonexistent
 * table. Called conditionally from bootstrap/server.js when
 * config.settings.setClassification is set; that setting currently has no
 * env var binding in utils/config.js, so the call site is presently unreachable too.
 */
exports.setConfigurationItem = async function (key, value) {
  return true
}

exports.getCeDump = async function() {
  const sql = `SELECT ceDumpTime FROM ce_dump LIMIT 1`
  const [rows] = await dbUtils.pool.query(sql)
  if (rows.length === 0) {
    return null
  }
  return rows[0].ceDumpTime
}

/**
 * getAppData - streams JSONL records to the response. The JSONL are either
 * data records from a MySQL table (always an array) or metadata records (always an object).
 * 
 * @param {import('express').Response} res express response
 * @returns {undefined}
 * @example Abbreviated example of JSONL which is streamed to the response:
 *  {"version":"1.4.13","commit":{"branch":"na","sha":"na","tag":"na","describe":"na"},"date":"2024-08-18T15:29:16.784Z","lastMigration":33}\n
    {"tables":[{"table":"village","rowCount":4}, ... ], "totalRows": 4}\n
    {"table":"village","columns":"`id`, `name`","rowCount":4}\n
    ["1","Quahog Senior Village"]\n
    ["2","Innsmouth Senior Village"]\n
    ["3","Miskatonic Senior Village"]\n
    ["4","Arkham Senior Village"]\n ...
 */
exports.getAppData = async function (res, format) {
  /** @type {string[]} tables to exclude from the appdata file */
  const excludedTables = [
    '_migrations'
  ]

  let sink
  if (format === 'gzip') {
    /** @type {zlib.Gzip} transform stream to compress JSONL records and write to the response */
    sink = zlib.createGzip()
    sink.pipe(res)
  }
  else {
    /** @type {http.ServerResponse} */
    sink = res
  }
  sink.setMaxListeners(Infinity)


  // Write metadata record {version, commit, date, lastMigration}
  const {version, commit, lastMigration} = config
  sink.write(JSON.stringify({version, commit, date: new Date(), lastMigration}) + '\n')
   
  // Execute SQL to retrieve a list of tables and their non-generated columns. The query binds
  // to the schema name and the excluded tables.
  /** @type {Array.<Array.<{table:string, columns:string[]}>} */
  const sql = `SELECT
    TABLE_NAME as \`table\`,
    cast(concat('[', group_concat(CONCAT('"\`',COLUMN_NAME,'\`"') order by COLUMN_NAME), ']') as json) as columns
  FROM
    INFORMATION_SCHEMA.COLUMNS 
  where
    TABLE_SCHEMA=? 
    and TABLE_NAME IN (select TABLE_NAME FROM INFORMATION_SCHEMA.TABLES where TABLE_SCHEMA=? and TABLE_TYPE='BASE TABLE')
    and TABLE_NAME not in (?)
    and EXTRA NOT LIKE '% GENERATED'
  group by
    TABLE_NAME`
  const [tableRows] = await dbUtils.pool.query(sql, [config.database.schema, config.database.schema, excludedTables])

  /**
   * @type {Object.<string, {columns:string, rowCount?:number}>} object pivoted from tableRows[]
   * @example
   * '{
        "person": {
          "columns": "`id`,`firstName`,`lastName`, ... "
        },
        "village": {
          "columns": "`id`,`name`"
        },
        "service_request": {
          "columns": "`id`,`serviceDate`,`status`, ... "
        }
      }'
   */
  const tableMetadata = tableRows.reduce((acc, value) => {
    acc[value.table] = {columns:value.columns.join(',')}
    return acc
  }, {})


  /** @type {string[]} */
  const tableNames = Object.keys(tableMetadata)

  /** @type {number} incremented by the row count of each table */
  let totalRows = 0

  /** @type {{table:string, rowCount:number}[]} */
  let tables = []

  // Select and handle the row count for each table. 
  for (const table of tableNames) {
    const [row] = await dbUtils.pool.query(`select count(*) as cnt from ${table}`)
    const rowCount = row[0].cnt
    tableMetadata[table].rowCount = rowCount
    tables.push({table, rowCount})
    totalRows += rowCount
  }

  // Write metadata record {tables, totalRows}
  sink.write(JSON.stringify({tables, totalRows}) + '\n')

  for (const table of tableNames) {
    // create readable stream using the non-promise interface of dbUtils.pool.pool
    // select all rows for non-generated columns in table
    // perform custom type casting of fields to JS
    /** @type {Readable} */
    const queryStream = dbUtils.pool.pool.query({
      sql: `select ${tableMetadata[table].columns} from ${table}`,
      rowsAsArray: true,
      typeCast: function (field, next) {
         // BIT fields returned as boolean
        if ((field.type === "BIT") && (field.length === 1)) {
          let bytes = field.buffer() || [0]
          return (bytes[0] === 1)
        }
         // Designated fields returned as original MySQL strings
        if (field.type === 'JSON' || field.type === 'DATETIME' || field.type === 'DATE' || field.type === 'TIMESTAMP' || field.type === 'TIME' || field.type === 'YEAR') {
          return (field.string("utf8"))
        }
        return next()
      }
     }).stream()

    // Write metadata record {table, columns, rowCount}
    sink.write(JSON.stringify({table, ...tableMetadata[table]}) + '\n')

    /** @type {Transform} writes a JSONL data record for each tuple of row data*/
    const bjson = new Transform({
      objectMode: true,
      transform: (data, encoding, cb) => {
        // BSJON supports stringify() and parse() of Buffer values
        cb(null, BJSON.stringify(data) + '\n')
      }
    })

    // pipeline writes data records [field, field, ...] to sink, ends without closing sink
    await pipeline(queryStream, bjson, sink, { end: false })
  }

  // ending sink will also end the response
  sink.end()
}

exports.getAppDataTables = async function () {
  const sql = `SELECT
    TABLE_NAME as name,
    TABLE_ROWS as \`rows\`,
    DATA_LENGTH as dataLength
  FROM
    information_schema.TABLES
  WHERE
    TABLE_SCHEMA=? and TABLE_TYPE='BASE TABLE'
  ORDER BY
    TABLE_NAME`
  const [rows] = await dbUtils.pool.query(sql, [config.database.schema])
  return (rows)
}

/**
 * replaceAppData - process a file created by getAppData() and execute SQL queries with progress messages
 * 
 * @param {Buffer} buffer - buffer with file content
 * @param {function(Object)} progressCb - optional, argument is an object with progress status
 * @returns {Promise} promise
 */
exports.replaceAppData = async function (buffer, contentType, progressCb = () => {}) {
  /**
   * ParseJSONLStream - Transform chunks of JSONL records into individual parsed AppData records (N:1).
   * @extends Transform
   */
  
  /** @type {boolean} needsMigrations - indicates if migrations are required */
  let needsMigrations = false
  class ParseJSONLStream extends Transform {
    /**
     * @param {Object} param
     * @param {function(string):any} param.jsonParser - function for JSON parsing, default JSON.parse()
     * @param {string} param.separator - character separating JSONL records, default '\n'
     */
    constructor({jsonParser = JSON.parse, separator = '\n'} = {}) {
      super({objectMode: true})
      Object.assign(this, {separator, jsonParser})
  
      /** @type {RegExp} RegExp for .split() that includes any trailing separator */
      this.splitRegExp = new RegExp(`(?<=${separator})`)
  
      /** @type {string} holds incoming chunk prefaced by any partial record from previous transform */
      this.buffer = '' 
    }

    /**
     * @param {Buffer} chunk - buffer from Gunzip that can span multiple JSONL records
     * @param {string} encoding - usually 'utf8'
     * @param {function()} cb - signals completion
     */
    _transform(chunk, encoding, cb) {
      this.buffer += chunk.toString(encoding)
      
      /** @type {string[]} list of JSONL, last item might be truncated or partial */
      const candidates = this.buffer.split(this.splitRegExp)
      /** @type {number} index of last candidates[] item */
      const lastIndex = candidates.length - 1

      // clear buffer for the next _transform() or _flush()
      this.buffer = ''
  
      /** index @type {number} */
      /** candidate @type {string} */
      for (const [index, candidate] of candidates.entries()) {
        if (index === lastIndex && !candidate.endsWith(this.separator)) {
          // this is the last candidate and there's no trailing separator
          // initialize buffer for next _transform() or _flush()
          this.buffer = candidate
        }
        else {
          try {
            // if parsable, write parsed value
            this.push(this.jsonParser(candidate))
          }
          // swallow any parse error
          catch {}
        }
      }
      cb()
    }
    /** @param {function()} cb signals completion */
    _flush(cb) {
      try {
        // if what's left in the buffer is parsable, write parsed value
        if (this.buffer) this.push(this.jsonParser(this.buffer))
      }
      // swallow any parse error
      catch {}
      cb()
    }
  }

  /**
   * AppDataQueryStream - Transform AppData records into an SQL query object (N:1)
   * @extends Transform
   */
  class AppDataQueryStream extends Transform {
    /**
     * @param {Object} param
     * @param {number} param.maxValues - maximum number of values for an insert query.
     * @param {function(Object): any} param.onTablesFn - called when record {tables, ...} is read
     * @param {function(Object): any} param.onMigrationFn - called when record {..., lastMigration} is read
     */
    constructor({maxValues = 10000, onTablesFn = new Function(), onMigrationFn = async function () {}}) {
      super({objectMode: true})
      Object.assign(this, { maxValues, onTablesFn, onMigrationFn })
      
      /** @type {null|Object} the last metadata record encountered */
      this.currentMetadata = null
      
      /** @type {Array} values for an insert query */
      this.currentBinds = []
    }

    /**
     * @param {Buffer} chunk a single AppData record
     * @param {string} encoding usually 'utf8'
     * @param {function()} cb signals completion
     */
    async _transform(chunk, encoding, cb) {
      if (Array.isArray(chunk)) {
        this.currentBinds.push(chunk)
        if (this.currentBinds.length === this.maxValues || this.currentBinds.length === 0) {
          this.push(this.formatCurrentQuery())
          this.currentBinds = []
        }
      }
      else if (chunk.lastMigration) {
        try {
          await this.onMigrationFn(chunk)
        }
        catch (e) {
          cb(e)
          return
        }
      }
      else if (chunk.table){
        if (this.currentMetadata) { 
          this.push(this.formatCurrentQuery())
        }
        this.currentMetadata = chunk
        this.currentBinds = []
        this.push(this.formatCurrentQuery())
      }
      else if (chunk.tables) {
        try {
          this.onTablesFn(chunk)
        }
        catch (e) {
          cb(e)
          return
        }
      }
      else {
        this.currentMetadata = null
      }
      cb()
    }
    
    /** @param {function()} cb signals completion */
    _flush(cb) {
      this.push(this.formatCurrentQuery())
      cb()
    }

    /** 
     * Creates an object with an SQL insert or truncate statement that operates
     * on the current table and any current binds
     * @returns {{table:string, sql:string, valueCount:number}} */
    formatCurrentQuery() {
      const sqlInsert = this.currentBinds.length
        ? `insert into ${this.currentMetadata.table}(${this.currentMetadata.columns}) values ?`
        : `truncate ${this.currentMetadata.table}`
      return {
        table: this.currentMetadata.table,
        sql: dbUtils.pool.format(sqlInsert, [this.currentBinds]),
        valueCount: this.currentBinds.length
      }
    }
  }

  /** 
   * @param {any} record expected to be AppData metadata {..., lastMigration}
   * @returns {undefined}
   * @throws {Error}
   */
  async function onMigrationFn(record) {
    if (record.lastMigration === config.lastMigration) return
    if (record.lastMigration > config.lastMigration) {
      throw new Error(`API migration v${config.lastMigration} is less than the source migration v${record.lastMigration}`) 
    }
    needsMigrations = true
    await resetDatabase()
    await migrateTo(record.lastMigration)
  }

  async function migrateTo(migration = config.lastMigration) {
    const endMigration = migration.toString().padStart(4, '0') + '.js'
    const umzug = new Umzug({
      migrations: {
        path: path.join(__dirname, './migrations'),
        params: [dbUtils.pool]
      },
      storage: path.join(__dirname, './migrations/lib/umzug-mysql-storage'),
      storageOptions: {
        pool: dbUtils.pool
      }
    })
    umzug.on('migrating', (name) => {
      progressCb({migration: name, status: 'started'})
    })
    umzug.on('migrated', (name) => {
      progressCb({migration: name, status: 'finished'})
    })
    await umzug.up({to: endMigration})
  }

  async function resetDatabase() {
    const connection = await dbUtils.pool.getConnection()
    const sql = `SELECT
    table_name,
    table_type
      FROM
        information_schema.TABLES
      WHERE
        TABLE_SCHEMA=?`
    const [tables] = await connection.query(sql,[config.database.schema])
    await connection.query('SET FOREIGN_KEY_CHECKS = 0')
    for (const table of tables) {
      const drop = `DROP ${table.TABLE_TYPE === 'BASE TABLE' ? 'TABLE' : 'VIEW'} ${table.TABLE_NAME}`
      await connection.query(drop)
      progressCb({sql: drop})
    }
    await connection.query('SET FOREIGN_KEY_CHECKS = 1')
    await connection.release()
  }

  function createChunkedReadable(buffer, chunkSize = 64 * 1024) {
    let offset = 0
    return new Readable({
      read() {
        if (offset >= buffer.length) {
          this.push(null) // No more data, signal end of stream
        } 
        else {
          const chunk = buffer.subarray(offset, offset + chunkSize)
          this.push(chunk) // Push the next chunk
          offset += chunkSize
        }
      }
    })
  }
  
  /** @type {import('mysql2/promise').PoolConnection} */
  let connection
  try {
    connection = await dbUtils.pool.getConnection()
    await connection.query('SET FOREIGN_KEY_CHECKS=0')
    const jsonl = new ParseJSONLStream({jsonParser: BJSON.parse})
    const queries = new AppDataQueryStream({maxValues: 10000, onTablesFn: progressCb, onMigrationFn})
    if (contentType === 'application/gzip' || contentType === 'application/x-gzip') {
      pipeline(Readable.from(buffer), zlib.createGunzip(), jsonl, queries)
    }
    else {
      pipeline(createChunkedReadable(buffer, 10 * 1024 * 1024), jsonl, queries)
    }
    let seq = 0
    for await (const data of queries) {
      await connection.query(data.sql)
      seq++
      progressCb({seq, table: data.table, valueCount: data.valueCount})
    }
    if (needsMigrations) await migrateTo(config.lastMigration)
    progressCb({status: 'success'})

  }
  catch (err) {
    progressCb({status: 'fail', error: err.message})
    return undefined
  }
  finally {
    if (typeof connection !== 'undefined') {
      await connection.query('SET FOREIGN_KEY_CHECKS=1')
      connection.release()
    }
  }
}

exports.getAppInfo = async function(options = {}) {
  const { includeRowCounts } = options
  const schema = 'village-green-appinfo-v1.2'
  const sqlAnalyze = `ANALYZE TABLE service_request, person, volunteer, user_data`
  const sqlInfoSchema = `
  SELECT
    TABLE_NAME as tableName,
    TABLE_ROWS as tableRows,
    TABLE_COLLATION as tableCollation,
    AVG_ROW_LENGTH as avgRowLength,
    DATA_LENGTH as dataLength,
    INDEX_LENGTH as indexLength,
    AUTO_INCREMENT as autoIncrement,
    CREATE_TIME as createTime,
    UPDATE_TIME as updateTime
  FROM
    information_schema.TABLES
  WHERE
    TABLE_SCHEMA = ?
    and TABLE_TYPE='BASE TABLE'
  ORDER BY
    TABLE_NAME`
  const sqlUserInfo = `
  select
    ud.userId,
    ud.username,
    ud.created,
    ud.lastAccess,
    coalesce(
      JSON_EXTRACT(ud.lastClaims, '$.${config.oauth.claims.privileges}'),
      json_array()
    ) as privileges
  from
    user_data ud
  `

  const sqlUserGroupInfo = `
  select
    ug.userGroupId,
    ug.name,
    count(distinct ugum.userId) as members,
    ug.createdDate as created,
    ug.modifiedDate
  from
    user_group ug
	  left join user_group_user_map ugum ON ugum.userGroupId = ug.userGroupId
  group by
	  ug.userGroupId
  `
  const sqlMySqlVersion = `SELECT VERSION() as version`

  const mySqlVariablesOnly = [
    'innodb_buffer_pool_size',
    'innodb_buffer_pool_instances',
    'innodb_log_buffer_size',
    'innodb_log_file_size',
    'innodb_redo_log_capacity',
    'innodb_io_capacity',
    'innodb_io_capacity_max',
    'innodb_flush_sync',
    'innodb_lock_wait_timeout',
    'innodb_change_buffering',
    'innodb_flush_log_at_trx_commit',
    'innodb_doublewrite',
    'tmp_table_size',
    'max_heap_table_size',
    'temptable_max_mmap',
    'temptable_max_ram',
    'key_buffer_size',
    'sort_buffer_size',
    'read_buffer_size',
    'read_rnd_buffer_size',
    'join_buffer_size',
    'binlog_cache_size',
    'max_connections',
    'max_allowed_packet',
    'thread_cache_size',
    'table_open_cache',
    'table_definition_cache',
    'version',
    'version_compile_machine',
    'version_compile_os',
    'long_query_time'
  ]
  const sqlMySqlVariablesValues = `
  SELECT 
    variable_name,
    variable_value as value
    FROM 
    performance_schema.global_variables
  WHERE 
    variable_name IN (${mySqlVariablesOnly.map(v => `'${v}'`).join(',')})
    ORDER by variable_name
  `
  const mySqlStatusOnly = [
  // Network
  'Bytes_received',
  'Bytes_sent',
  // Handler operations
  'Handler_commit',
  'Handler_update',
  'Handler_write',
  // Buffer pool health (performance monitoring)
  'Innodb_buffer_pool_bytes_data',
  'Innodb_buffer_pool_pages_total',
  'Innodb_buffer_pool_pages_free',
  'Innodb_buffer_pool_pages_dirty',
  'Innodb_buffer_pool_pages_flushed',
  'Innodb_buffer_pool_read_requests',
  'Innodb_buffer_pool_reads',
  'Innodb_buffer_pool_wait_free',
  // Redo log / Checkpoint (detect checkpoint thrashing)
  'Innodb_redo_log_current_lsn',
  'Innodb_redo_log_checkpoint_lsn',
  'Innodb_redo_log_flushed_to_disk_lsn',
  'Innodb_log_waits',
  'Innodb_log_writes',
  'Innodb_os_log_fsyncs',
  // I/O operations
  'Innodb_data_reads',
  'Innodb_data_writes',
  'Innodb_data_fsyncs',
  'Innodb_pages_read',
  'Innodb_pages_written',
  'Innodb_pages_created',
  // Row operations
  'Innodb_rows_read',
  'Innodb_rows_updated',
  'Innodb_rows_inserted',
  'Innodb_rows_deleted',
  // Row locking
  'Innodb_row_lock_waits',
  'Innodb_row_lock_current_waits',
  'Innodb_row_lock_time',
  'Innodb_row_lock_time_avg',
  'Innodb_row_lock_time_max',
  // Temp tables
  'Created_tmp_tables',
  'Created_tmp_disk_tables',
  'Created_tmp_files',
  // Table cache
  'Open_tables',
  'Opened_tables',
  'Table_open_cache_hits',
  'Table_open_cache_misses',
  'Table_open_cache_overflows',
  // Connections/Threads
  'Connections',
  'Max_used_connections',
  'Threads_connected',
  'Threads_running',
  'Threads_created',
  'Threads_cached',
  'Aborted_connects',
  'Aborted_clients',
  // Queries
  'Queries',
  'Slow_queries',
  'Select_scan',
  'Select_full_join',
  'Select_full_range_join',
  // Sorts
  'Sort_merge_passes',
  'Sort_scan',
  'Sort_range',
  'Sort_rows',
  // Table locks
  'Table_locks_immediate',
  'Table_locks_waited',
  // Server
  'Uptime',
  'Uptime_since_flush_status'
  ]
  const sqlMySqlStatusValues = `
  SELECT 
    variable_name,
    variable_value as value
  FROM 
    performance_schema.global_status
  WHERE 
    variable_name IN (
        ${mySqlStatusOnly.map( v => `'${v}'`).join(',')}
    )
  ORDER by variable_name
  `
  await dbUtils.pool.query(sqlAnalyze)
  const [schemaInfoArray] = await dbUtils.pool.query(sqlInfoSchema, [config.database.schema])
  const tables = createObjectFromKeyValue(schemaInfoArray, "tableName")

  const queries = [
    dbUtils.pool.query(sqlUserInfo),
    dbUtils.pool.query(sqlUserGroupInfo),
    dbUtils.pool.query(sqlMySqlVersion),
    dbUtils.pool.query(sqlMySqlVariablesValues),
    dbUtils.pool.query(sqlMySqlStatusValues)
  ]

  // Conditionally add row count queries
  if (includeRowCounts) {
    const rowCountQueries = []
    for (const table in tables) {
      rowCountQueries.push(dbUtils.pool.query(`SELECT "${table}" as tableName, count(*) as rowCount from ${table}`))
    }
    queries.push(Promise.all(rowCountQueries))
  }

  const results = await Promise.all(queries)
  
  let [
    [userInfo],
    [userGroupInfo],
    [mySqlVersion],
    [mySqlVariables],
    [mySqlStatus],
    rowCountResults
  ] = results

  // Set row counts from individual queries or use null when not counting
  if (includeRowCounts) {
    for (const result of rowCountResults) {
      tables[result[0][0].tableName].rowCount = result[0][0].rowCount
    }
  } else {
    // Use null to indicate exact row counts were not requested
    for (const tableName in tables) {
      tables[tableName].rowCount = null
    }
  }

  // remove strings from user privileges array that are not meaningful to vg
  const vgPrivs = ['admin', 'create_collection']
  for (const user of userInfo ) {
    user.privileges = user.privileges.filter(v => vgPrivs.includes(v))
  }

  //count privilege assignments and break out by lastAccess time periods
  const userPrivilegeCounts = breakOutPrivilegeUsage(userInfo)

  //create working copy of operational stats
  const requests = klona(logger.requestStats)

  requests.operationIds = sortObjectByKeys(requests.operationIds)

  const returnObj = {
    date: new Date().toISOString(),
    schema,
    version: config.version,
    requests,
    users: {
      userInfo: createObjectFromKeyValue(userInfo, "userId", null),
      userPrivilegeCounts
    },
    groups: createObjectFromKeyValue(userGroupInfo, "userGroupId", null),
    mysql: {
      version: mySqlVersion[0].version,
      tables,
      variables: createObjectFromKeyValue(mySqlVariables, "variable_name", "value"),
      status: createObjectFromKeyValue(mySqlStatus, "variable_name", "value")
    },
    nodejs: getNodeValues()
  }
  return returnObj

  // Reduce an array of objects to a single object, using the value of one property as keys
  // and either assigning the rest of the object or the value of a second property as the value.
  function createObjectFromKeyValue(data, keyPropertyName, valuePropertyName = null, includeKey = false) {
    return data.reduce((acc, item) => {
      const { [keyPropertyName]: key, ...rest } = item
      acc[key] = valuePropertyName ? item[valuePropertyName] : includeKey ? item : rest
      return acc
    }, {})
  }

  function sortObjectByKeys(obj) {
    // Create a new object and add properties in sorted order
    const sortedObj = {}
    for (const key of Object.keys(obj).sort()) {
      sortedObj[key] = obj[key]
    }
    return sortedObj
  }

  function breakOutPrivilegeUsage(userInfo) {
    let privilegeCounts = {
      overall: {none:0},
      activeInLast30Days: {none:0},
      activeInLast90Days: {none:0}
    }
    
    // Calculate the timestamps for 30 and 90 days ago
    const currentTime = Math.floor(Date.now() / 1000)
    const thirtyDaysAgo = currentTime - (30 * 24 * 60 * 60)
    const ninetyDaysAgo = currentTime - (90 * 24 * 60 * 60)
    const updateCounts = (categoryCounts, userPrivs) => {
      if (userPrivs.length === 0) {
        categoryCounts.none++
      }
      for (const privilege of userPrivs) {
        categoryCounts[privilege] = categoryCounts[privilege] ? categoryCounts[privilege] + 1 : 1
      }
    }

    for (const user of userInfo) {
      updateCounts(privilegeCounts.overall, user.privileges)
      // Update counts for the last 30 and 90 days based on lastAccess
      if (user.lastAccess >= ninetyDaysAgo) {
        updateCounts(privilegeCounts.activeInLast90Days, user.privileges)
      }
      if (user.lastAccess >= thirtyDaysAgo) {
        updateCounts(privilegeCounts.activeInLast30Days, user.privileges)
      }
    }
    return privilegeCounts
  }

  function getNodeValues() {
    const {environmentVariables, header, resourceUsage} = process.report.getReport()
    
    const environment = {}
    for (const [key, value] of Object.entries(environmentVariables)) {
      if (/^(NODE|VG)_/.test(key)) {
        environment[key] = key === 'VG_DB_PASSWORD' ? '***' : value
      }
    }
    const {platform, arch, nodejsVersion, cpus, osMachine, osName, osRelease} = header
    for (let x = 0; x < cpus.length; x++) {
      cpus[x] = {model: cpus[x].model, speed: cpus[x].speed}
    }
    const loadAverage = os.loadavg().join(', ')

    const memory = process.memoryUsage()
    memory.maxRss = resourceUsage.maxRss
    return {
      version: nodejsVersion.substring(1),
      uptime: process.uptime(),
      os: {
        platform,
        arch,
        osMachine,
        osName,
        osRelease,
        loadAverage
      },
      environment,
      memory,
      cpus
    }
  }
}

exports.getRoles = async function () {
  const sql = `
  select
    cast(r.roleId as char) as roleId,
    r.name,
    r.scope,
    r.description,
    r.isSystem = 1 as isSystem,
    coalesce(json_arrayagg(rp.permission), json_array()) as permissions
  from role r
    left join role_permission rp on r.roleId = rp.roleId
  group by r.roleId
  order by r.roleId`
  const [rows] = await dbUtils.pool.query(sql)
  for (const row of rows) {
    row.isSystem = !!row.isSystem
    row.permissions = row.permissions.filter(p => p !== null)
  }
  return rows
}

