const logger = require('../../utils/logger')
const path = require('node:path')

const migrationName = path.basename(__filename, '.js')

// Schema changes to receive migrated Community Engine (CE) member and
// service-provider (volunteer) data. See the field mappings in the migrate-ce
// project: scratch/migrate-member-mapping.md and
// scratch/migrate-service-provider-mapping.md.
//
// person   - replaces the single `address` column with normalized
//            street/unit source columns plus a generated display column, and
//            adds person-level attributes shared by members and providers.
// member   - adds CE membership lifecycle and bookkeeping fields.
// volunteer- adds provider_type.
// new      - disability + person_disability (multi-valued member trait),
//            vetting_type + volunteer_vetting (provider credentials).
//
// This migration is written in the procedural (JS) style because the existing
// person.address values must be split into street/unit BEFORE the address
// column is dropped and recreated as a generated column. Existing address
// values were produced by the CE report formula
//   Concatenate({Address 2}, ", ", {Address 1})  ==  "{street}, {unit}"
// so the backfill splits on the last ", " into street/unit. To stay lossless
// it only treats the trailing segment as a unit when it looks like one;
// otherwise the whole value becomes street and unit is left NULL.
//
// All steps are guarded against INFORMATION_SCHEMA so the migration is
// idempotent and safe to re-run.

const UNIT_RE = "^(apt|apartment|unit|suite|ste|fl|floor|#|rm|room|bldg|building|lot|trlr|trailer)\\b"

async function columnExists (connection, table, column) {
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS count FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  )
  return rows[0].count > 0
}

async function tableExists (connection, table) {
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS count FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table]
  )
  return rows[0].count > 0
}

async function addColumnIfMissing (connection, table, column, ddl) {
  if (await columnExists(connection, table, column)) return
  logger.writeInfo('mysql', 'migration', { status: 'running', name: migrationName, statement: ddl })
  await connection.query(ddl)
}

async function run (connection, statement) {
  logger.writeInfo('mysql', 'migration', { status: 'running', name: migrationName, statement })
  await connection.query(statement)
}

const upFn = async (pool) => {
  const connection = await pool.getConnection()
  try {
    // ---------------------------------------------------------------------
    // person: address normalization (street/unit + generated address)
    // ---------------------------------------------------------------------
    // 1) Add the new source columns (plain, not yet generated).
    await addColumnIfMissing(connection, 'person', 'street',
      `ALTER TABLE person ADD COLUMN street varchar(200) DEFAULT NULL AFTER nickname`)
    await addColumnIfMissing(connection, 'person', 'unit',
      `ALTER TABLE person ADD COLUMN unit varchar(100) DEFAULT NULL AFTER street`)

    // 2) Backfill street/unit from the legacy concatenated address, BUT only
    //    if the legacy plain `address` column is still present (i.e. it has
    //    not already been replaced by the generated column on a prior run).
    const legacyAddressPresent = await columnExists(connection, 'person', 'address')
    let addressIsGenerated = false
    if (legacyAddressPresent) {
      const [gen] = await connection.query(
        `SELECT EXTRA FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'person' AND COLUMN_NAME = 'address'`)
      addressIsGenerated = gen.length > 0 && /GENERATED/i.test(gen[0].EXTRA || '')
    }

    if (legacyAddressPresent && !addressIsGenerated) {
      // Split on the LAST ", " only when the trailing segment looks like a
      // unit designator; otherwise the whole address becomes the street.
      // SUBSTRING_INDEX(..., ', ', -1) -> last segment; the rest is street.
      await run(connection,
        `UPDATE person
            SET unit = TRIM(SUBSTRING_INDEX(address, ', ', -1)),
                street = TRIM(SUBSTRING(address, 1,
                           CHAR_LENGTH(address) - CHAR_LENGTH(SUBSTRING_INDEX(address, ', ', -1)) - 2))
          WHERE address IS NOT NULL
            AND address LIKE '%, %'
            AND LOWER(TRIM(SUBSTRING_INDEX(address, ', ', -1))) REGEXP '${UNIT_RE}'`)

      // Everything else (no comma, or trailing segment is not a unit) ->
      // whole value into street, unit stays NULL. Lossless.
      await run(connection,
        `UPDATE person
            SET street = TRIM(address)
          WHERE address IS NOT NULL
            AND street IS NULL
            AND TRIM(address) <> ''`)

      // 3) Drop the legacy plain address column (data now lives in street/unit).
      await run(connection, `ALTER TABLE person DROP COLUMN address`)
    }

    // 4) (Re)create address as a STORED generated column.
    if (!(await columnExists(connection, 'person', 'address'))) {
      await run(connection,
        `ALTER TABLE person ADD COLUMN address varchar(300)
           GENERATED ALWAYS AS (CONCAT_WS(', ', street, unit)) STORED AFTER unit`)
    }

    // ---------------------------------------------------------------------
    // person: shared attributes
    // ---------------------------------------------------------------------
    await addColumnIfMissing(connection, 'person', 'middle_initial',
      `ALTER TABLE person ADD COLUMN middle_initial varchar(10) DEFAULT NULL`)
    await addColumnIfMissing(connection, 'person', 'salutation',
      `ALTER TABLE person ADD COLUMN salutation varchar(20) DEFAULT NULL`)
    await addColumnIfMissing(connection, 'person', 'computer_use',
      `ALTER TABLE person ADD COLUMN computer_use tinyint(1) DEFAULT NULL`)
    await addColumnIfMissing(connection, 'person', 'smartphone',
      `ALTER TABLE person ADD COLUMN smartphone tinyint(1) DEFAULT NULL`)
    await addColumnIfMissing(connection, 'person', 'comments',
      `ALTER TABLE person ADD COLUMN comments text DEFAULT NULL`)
    await addColumnIfMissing(connection, 'person', 'email_status',
      `ALTER TABLE person ADD COLUMN email_status varchar(50) DEFAULT NULL`)

    // ---------------------------------------------------------------------
    // member: CE membership fields
    // ---------------------------------------------------------------------
    await addColumnIfMissing(connection, 'member', 'status',
      `ALTER TABLE member ADD COLUMN status varchar(50) DEFAULT NULL`)
    await addColumnIfMissing(connection, 'member', 'drop_reason',
      `ALTER TABLE member ADD COLUMN drop_reason varchar(100) DEFAULT NULL`)
    await addColumnIfMissing(connection, 'member', 'created_date',
      `ALTER TABLE member ADD COLUMN created_date date DEFAULT NULL`)
    await addColumnIfMissing(connection, 'member', 'member_type',
      `ALTER TABLE member ADD COLUMN member_type varchar(50) DEFAULT NULL`)
    await addColumnIfMissing(connection, 'member', 'household_dues',
      `ALTER TABLE member ADD COLUMN household_dues decimal(10,2) DEFAULT NULL`)
    await addColumnIfMissing(connection, 'member', 'household_size',
      `ALTER TABLE member ADD COLUMN household_size tinyint DEFAULT NULL`)
    await addColumnIfMissing(connection, 'member', 'quickbooks_key',
      `ALTER TABLE member ADD COLUMN quickbooks_key varchar(50) DEFAULT NULL`)
    await addColumnIfMissing(connection, 'member', 'printed_newsletter',
      `ALTER TABLE member ADD COLUMN printed_newsletter tinyint(1) DEFAULT NULL`)
    await addColumnIfMissing(connection, 'member', 'confidential_notes',
      `ALTER TABLE member ADD COLUMN confidential_notes text DEFAULT NULL`)
    await addColumnIfMissing(connection, 'member', 'status_change_notes',
      `ALTER TABLE member ADD COLUMN status_change_notes text DEFAULT NULL`)
    await addColumnIfMissing(connection, 'member', 'misc_notes',
      `ALTER TABLE member ADD COLUMN misc_notes text DEFAULT NULL`)

    // ---------------------------------------------------------------------
    // volunteer: provider role
    // ---------------------------------------------------------------------
    await addColumnIfMissing(connection, 'volunteer', 'provider_type',
      `ALTER TABLE volunteer ADD COLUMN provider_type varchar(50) DEFAULT NULL`)

    // ---------------------------------------------------------------------
    // disability (member multi-valued trait)
    // ---------------------------------------------------------------------
    if (!(await tableExists(connection, 'disability'))) {
      await run(connection,
        `CREATE TABLE disability (
          id   int NOT NULL AUTO_INCREMENT,
          name varchar(100) NOT NULL,
          PRIMARY KEY (id),
          UNIQUE KEY name (name)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`)
    }
    if (!(await tableExists(connection, 'person_disability'))) {
      await run(connection,
        `CREATE TABLE person_disability (
          id            int NOT NULL AUTO_INCREMENT,
          person_id     int NOT NULL,
          disability_id int NOT NULL,
          PRIMARY KEY (id),
          UNIQUE KEY person_disability (person_id, disability_id),
          KEY disability_id (disability_id),
          CONSTRAINT person_disability_ibfk_1 FOREIGN KEY (person_id)     REFERENCES person (id),
          CONSTRAINT person_disability_ibfk_2 FOREIGN KEY (disability_id) REFERENCES disability (id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`)
    }

    // ---------------------------------------------------------------------
    // vetting (volunteer credentials)
    // ---------------------------------------------------------------------
    if (!(await tableExists(connection, 'vetting_type'))) {
      await run(connection,
        `CREATE TABLE vetting_type (
          id   int NOT NULL AUTO_INCREMENT,
          name varchar(100) NOT NULL,
          PRIMARY KEY (id),
          UNIQUE KEY name (name)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`)
    }
    if (!(await tableExists(connection, 'volunteer_vetting'))) {
      await run(connection,
        `CREATE TABLE volunteer_vetting (
          id              int NOT NULL AUTO_INCREMENT,
          volunteer_id    int NOT NULL,
          vetting_type_id int NOT NULL,
          date_entered    date DEFAULT NULL,
          date_expired    date DEFAULT NULL,
          additional_data varchar(100) DEFAULT NULL,
          notes           text DEFAULT NULL,
          PRIMARY KEY (id),
          KEY volunteer_id (volunteer_id),
          KEY vetting_type_id (vetting_type_id),
          CONSTRAINT volunteer_vetting_ibfk_1 FOREIGN KEY (volunteer_id)    REFERENCES volunteer (id),
          CONSTRAINT volunteer_vetting_ibfk_2 FOREIGN KEY (vetting_type_id) REFERENCES vetting_type (id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`)
    }
  } finally {
    await connection.release()
  }
}

const downFn = async (pool) => {
  const connection = await pool.getConnection()
  try {
    await run(connection, `DROP TABLE IF EXISTS volunteer_vetting`)
    await run(connection, `DROP TABLE IF EXISTS vetting_type`)
    await run(connection, `DROP TABLE IF EXISTS person_disability`)
    await run(connection, `DROP TABLE IF EXISTS disability`)

    await run(connection, `ALTER TABLE volunteer DROP COLUMN IF EXISTS provider_type`)

    for (const col of ['misc_notes', 'status_change_notes', 'confidential_notes',
      'printed_newsletter', 'quickbooks_key', 'household_size', 'household_dues',
      'member_type', 'created_date', 'drop_reason', 'status']) {
      await run(connection, `ALTER TABLE member DROP COLUMN IF EXISTS ${col}`)
    }

    for (const col of ['email_status', 'comments', 'smartphone', 'computer_use',
      'salutation', 'middle_initial']) {
      await run(connection, `ALTER TABLE person DROP COLUMN IF EXISTS ${col}`)
    }

    // Collapse street/unit back into a plain address column (best-effort:
    // restores the displayable value but not the original 1/2 distinction).
    if (await columnExists(connection, 'person', 'address')) {
      await run(connection, `ALTER TABLE person DROP COLUMN address`)
    }
    await run(connection, `ALTER TABLE person ADD COLUMN address varchar(300) DEFAULT NULL`)
    if (await columnExists(connection, 'person', 'street')) {
      await run(connection,
        `UPDATE person SET address = CONCAT_WS(', ', street, unit)`)
      await run(connection, `ALTER TABLE person DROP COLUMN IF EXISTS unit`)
      await run(connection, `ALTER TABLE person DROP COLUMN IF EXISTS street`)
    }
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
