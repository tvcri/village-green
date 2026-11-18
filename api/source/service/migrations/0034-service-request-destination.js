// api/source/service/migrations/0034-service-request-destination.js
const MigrationHandler = require('./lib/MigrationHandler')

// Multiple destinations per service request. A child table, not columns: order
// is id ascending (no position column), and the API reissues ids on every save,
// so nothing may hold on to one. The flat destination/address/... columns on
// service_request stay and are still written on every save; dropping them is a
// later follow-up. The backfill gives every request that has any flat
// destination value one row. No seed rows, not a static-data table.
const upMigration = [
  `CREATE TABLE service_request_destination (
    id int NOT NULL AUTO_INCREMENT,
    serviceRequestId int NOT NULL,
    destination text NULL,
    address text NULL,
    city varchar(100) NULL,
    state varchar(50) NULL,
    zip varchar(20) NULL,
    phone varchar(50) NULL,
    PRIMARY KEY (id),
    KEY service_request_destination_sr_idx (serviceRequestId),
    CONSTRAINT service_request_destination_sr_fk FOREIGN KEY (serviceRequestId)
      REFERENCES service_request (id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`,
  `INSERT INTO service_request_destination
     (serviceRequestId, destination, address, city, state, zip, phone)
   SELECT id, destination, address, city, state, zip, phone
   FROM service_request
   WHERE COALESCE(NULLIF(destination,''), NULLIF(address,''), NULLIF(city,''),
                  NULLIF(state,''), NULLIF(zip,''), NULLIF(phone,'')) IS NOT NULL
   ORDER BY id`,
]

const downMigration = [
  `DROP TABLE service_request_destination`,
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
