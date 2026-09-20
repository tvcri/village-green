// api/source/service/migrations/0026-birth-date-permission.js
const MigrationHandler = require('./lib/MigrationHandler')

// person:read_birth_date is a NEW column gate on person.birthDate
// (PersonService read paths, Person write-strip, the birthday-month mailing
// label audience). Customer ask (Hub staff, 2026-09): only staff may see
// birthdays. Admin (roleId 4) holds '*' and needs nothing; Staff (roleId 5)
// is seeded so that role keeps its screens unchanged. Every other role loses
// birth-date visibility at deploy — that narrowing IS the ask. No schema change.
const upMigration = [
  `INSERT IGNORE INTO role_permission (roleId, permission) VALUES (5, 'person:read_birth_date')`,
]

const downMigration = [
  `DELETE FROM role_permission WHERE permission = 'person:read_birth_date'`,
]

const migrationHandler = new MigrationHandler(upMigration, downMigration)
module.exports = {
  up: async (pool) => {
    await migrationHandler.up(pool, __filename)
  },
  down: async (pool) => {
    await migrationHandler.down(pool, __filename)
  }
}
