const MigrationHandler = require('./lib/MigrationHandler')

const upMigration = [
  `RENAME TABLE email_event TO notification_event`,
  // Backfill legacy event_type to the new vocabulary. Old values were
  // new_request/patch_request; the new type derives solely from whether a
  // volunteer was assigned: volunteer -> confirmed, otherwise -> open. This
  // MUST run before volunteer_person_id is dropped below.
  `UPDATE notification_event
    SET event_type = IF(volunteer_person_id IS NOT NULL, 'confirmed', 'open')`,
  // Add the new columns first but keep volunteer_person_id in place so the
  // recipients backfill below can still read it. The column is dropped in the
  // final ALTER once the backfill is complete.
  `ALTER TABLE notification_event
    MODIFY COLUMN event_type VARCHAR(32) NOT NULL
      COMMENT 'open | confirmed | cancelled | reminder',
    ADD COLUMN recipients JSON NULL
      COMMENT 'Array of person ids notified, written by sidecar on send',
    ADD COLUMN failed_at TIMESTAMP NULL`,
  // Backfill recipients for prior records to match the sidecar's logic
  // (see ../vg-email-sidecar/src/email-processor.js).
  //
  // confirmed: the assigned volunteer plus the member, but only when the member
  // person has an email (the sidecar only adds the member when a member email
  // exists). Built as a JSON array of person ids.
  `UPDATE notification_event ne
    JOIN service_request sr ON sr.id = ne.service_request_id
    LEFT JOIN person mp ON mp.id = sr.member_person_id
    SET ne.recipients = JSON_ARRAY(
      ne.volunteer_person_id
    ) WHERE ne.event_type = 'confirmed' AND (mp.email IS NULL OR mp.email = '')`,
  `UPDATE notification_event ne
    JOIN service_request sr ON sr.id = ne.service_request_id
    JOIN person mp ON mp.id = sr.member_person_id
    SET ne.recipients = JSON_ARRAY(
      ne.volunteer_person_id, sr.member_person_id
    ) WHERE ne.event_type = 'confirmed' AND mp.email IS NOT NULL AND mp.email <> ''`,
  // open: the sidecar BCCs every volunteer in the request's village whose
  // capability matches the service type, and records those volunteer person ids
  // in recipients. The service_name -> capability mapping mirrors
  // SERVICE_TYPE_TO_CAPABILITY in the sidecar. Volunteers are joined the same
  // way as GET_VOLUNTEERS_BY_CAPABILITY (volunteer -> volunteer_capability ->
  // capability, gated on the request's village). Rows whose service_name is
  // unmapped, or that have no matching volunteers, are left with an empty array.
  `UPDATE notification_event ne
    JOIN service_request sr ON sr.id = ne.service_request_id
    LEFT JOIN (
      SELECT
        sr.id AS service_request_id,
        JSON_ARRAYAGG(p.id) AS person_ids
      FROM service_request sr
      JOIN capability c ON c.name = CASE sr.service_name
        WHEN 'Ride: Medical Appnt'         THEN 'Rides'
        WHEN 'Ride: Shopping'              THEN 'Rides'
        WHEN 'Ride: Activity/Event'        THEN 'Rides'
        WHEN 'Ride: Personal Care'         THEN 'Rides'
        WHEN 'Ride: Other'                 THEN 'Rides'
        WHEN 'Household Chores/Handy Help' THEN 'Home Help'
        WHEN 'Tech Support'                THEN 'Tech Support'
        WHEN 'Errand: Shopping'            THEN 'Errands'
        WHEN 'Errand: Pick up/delivery'    THEN 'Errands'
        WHEN 'Errand: Other'               THEN 'Errands'
        ELSE NULL
      END
      JOIN volunteer_capability vc ON vc.capability_id = c.id
      JOIN volunteer v ON v.id = vc.volunteer_id
      JOIN person p ON p.id = v.person_id AND p.village_id = sr.village_id
      GROUP BY sr.id
    ) cap ON cap.service_request_id = sr.id
    SET ne.recipients = COALESCE(cap.person_ids, JSON_ARRAY())
    WHERE ne.event_type = 'open'`,
  // Drop the legacy volunteer column now that recipients is populated.
  `ALTER TABLE notification_event
    DROP FOREIGN KEY fk_email_event_volunteer,
    DROP COLUMN volunteer_person_id`,
]

const downMigration = [
  `ALTER TABLE notification_event
    DROP COLUMN IF EXISTS failed_at,
    DROP COLUMN IF EXISTS recipients,
    MODIFY COLUMN event_type VARCHAR(32) NOT NULL,
    ADD COLUMN volunteer_person_id INT NULL,
    ADD CONSTRAINT fk_email_event_volunteer
      FOREIGN KEY (volunteer_person_id) REFERENCES person(id)`,
  `RENAME TABLE notification_event TO email_event`,
]

const migrationHandler = new MigrationHandler(upMigration, downMigration)
module.exports = {
  up: async (pool) => { await migrationHandler.up(pool, __filename) },
  down: async (pool) => { await migrationHandler.down(pool, __filename) },
}
