const path = require('path')
const logger = require('../../utils/logger')

// The one and only timezone conversion in this feature's lifetime: existing
// rows were written as UTC instants by browsers in America/New_York. This
// converts them to the wall-clock civil times the users actually meant,
// EDT/EST-correct, then the frame-crossing is gone for good.
const NY_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
  hour12: false
})

function toNewYork (utcDate) {
  const parts = Object.fromEntries(
    NY_FMT.formatToParts(utcDate).map(p => [p.type, p.value])
  )
  // Some ICU versions emit '24' for midnight under hour12:false — normalize.
  const hour = parts.hour === '24' ? '00' : parts.hour
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${hour}:${parts.minute}:${parts.second}`
  }
}

const DAY_MS = 24 * 60 * 60 * 1000

// Returns the new column values for one row. Exported shape documented in
// the plan; kept as a pure function so it can be eyeballed in isolation.
function convertRow (row) {
  const startAt = row.startAt ? new Date(row.startAt) : null
  const finishAt = row.finishAt ? new Date(row.finishAt) : null
  const apptAt = row.apptTime ? new Date(row.apptTime) : null
  const returnAt = row.returnTime ? new Date(row.returnTime) : null

  const st = startAt ? toNewYork(startAt) : null
  const fin = finishAt ? toNewYork(finishAt) : null

  const startIsAnchor = st !== null && st.time === '00:00:00'
  const finishIsAnchor = fin !== null && (
    fin.time === '23:59:00' ||
    fin.time === '23:59:59' ||
    (startAt && finishAt.getTime() === startAt.getTime()) ||
    (startIsAnchor && finishAt.getTime() - startAt.getTime() === DAY_MS)
  )

  const startTime = st && !startIsAnchor ? st.time : null
  const finishTime = fin && !finishIsAnchor ? fin.time : null
  const apptTime = apptAt ? toNewYork(apptAt).time : null
  const returnTime = returnAt ? toNewYork(returnAt).time : null

  return {
    serviceDate: st ? st.date : null,
    startTime,
    finishTime,
    apptTime,
    returnTime,
    timesFlexible:
      startTime === null && finishTime === null &&
      apptTime === null && returnTime === null ? 1 : 0
  }
}

module.exports = {
  convertRow, // exported for the scratch-schema rehearsal (Step 2); Umzug only calls up/down
  up: async (pool) => {
    const migrationName = path.basename(__filename, '.js')
    const connection = await pool.getConnection()
    try {
      logger.writeInfo('mysql', 'migration', { status: 'start', direction: 'up', name: migrationName })

      await connection.query(`ALTER TABLE service_request
        ADD COLUMN serviceDate DATE NULL AFTER createdAt,
        ADD COLUMN timesFlexible TINYINT(1) NOT NULL DEFAULT 0 AFTER serviceDate,
        ADD COLUMN startTime TIME NULL AFTER timesFlexible,
        ADD COLUMN finishTime TIME NULL AFTER startTime,
        ADD COLUMN apptTimeLocal TIME NULL AFTER finishTime,
        ADD COLUMN returnTimeLocal TIME NULL AFTER apptTimeLocal`)

      // Read UTC values as explicit strings: mysql2 would otherwise hydrate
      // DATETIME into JS Dates in the process's local zone.
      const [rows] = await connection.query(`SELECT id,
        DATE_FORMAT(startAt,  '%Y-%m-%dT%TZ') AS startAt,
        DATE_FORMAT(finishAt, '%Y-%m-%dT%TZ') AS finishAt,
        DATE_FORMAT(apptTime, '%Y-%m-%dT%TZ') AS apptTime,
        DATE_FORMAT(returnTime, '%Y-%m-%dT%TZ') AS returnTime
        FROM service_request`)

      for (const row of rows) {
        const v = convertRow(row)
        await connection.query(
          `UPDATE service_request SET serviceDate = ?, timesFlexible = ?,
             startTime = ?, finishTime = ?, apptTimeLocal = ?, returnTimeLocal = ?
           WHERE id = ?`,
          [v.serviceDate, v.timesFlexible, v.startTime, v.finishTime,
           v.apptTime, v.returnTime, row.id]
        )
      }
      logger.writeInfo('mysql', 'migration', { status: 'backfilled', name: migrationName, rows: rows.length })

      await connection.query(`ALTER TABLE service_request
        DROP COLUMN startAt,
        DROP COLUMN finishAt,
        DROP COLUMN apptTime,
        DROP COLUMN returnTime,
        RENAME COLUMN apptTimeLocal TO apptTime,
        RENAME COLUMN returnTimeLocal TO returnTime`)
    } catch (e) {
      logger.writeError('mysql', 'migration', { status: 'error', name: migrationName, message: e.message })
      throw e
    } finally {
      await connection.release()
      logger.writeInfo('mysql', 'migration', { status: 'finish', name: migrationName })
    }
  },

  down: async (pool) => {
    // Best-effort schema reversal. Values are reconstructed as a naive
    // local-frame merge (NOT the original UTC instants); the dev workflow
    // for real reversal is dump-restore.
    const migrationName = path.basename(__filename, '.js')
    const connection = await pool.getConnection()
    try {
      logger.writeInfo('mysql', 'migration', { status: 'start', direction: 'down', name: migrationName })
      await connection.query(`ALTER TABLE service_request
        ADD COLUMN startAt DATETIME NULL,
        ADD COLUMN finishAt DATETIME NULL,
        ADD COLUMN apptTimeOld DATETIME NULL,
        ADD COLUMN returnTimeOld DATETIME NULL`)
      await connection.query(`UPDATE service_request SET
        startAt  = IF(startTime  IS NULL, NULL, TIMESTAMP(serviceDate, startTime)),
        finishAt = IF(finishTime IS NULL, NULL, TIMESTAMP(serviceDate, finishTime)),
        apptTimeOld   = IF(apptTime   IS NULL, NULL, TIMESTAMP(serviceDate, apptTime)),
        returnTimeOld = IF(returnTime IS NULL, NULL, TIMESTAMP(serviceDate, returnTime))`)
      await connection.query(`ALTER TABLE service_request
        DROP COLUMN serviceDate,
        DROP COLUMN timesFlexible,
        DROP COLUMN startTime,
        DROP COLUMN finishTime,
        DROP COLUMN apptTime,
        DROP COLUMN returnTime,
        RENAME COLUMN apptTimeOld TO apptTime,
        RENAME COLUMN returnTimeOld TO returnTime`)
    } catch (e) {
      logger.writeError('mysql', 'migration', { status: 'error', name: migrationName, message: e.message })
      throw e
    } finally {
      await connection.release()
      logger.writeInfo('mysql', 'migration', { status: 'finish', name: migrationName })
    }
  }
}
