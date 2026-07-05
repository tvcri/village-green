const MigrationHandler = require('./lib/MigrationHandler')

const upMigration = [
  // Views depend on member/volunteer columns; drop before renaming.
  `DROP VIEW IF EXISTS active_member`,
  `DROP VIEW IF EXISTS active_volunteer`,

  `ALTER TABLE person
    RENAME COLUMN village_id TO villageId,
    RENAME COLUMN full_name TO fullName,
    RENAME COLUMN last_name TO lastName,
    RENAME COLUMN first_name TO firstName,
    RENAME COLUMN middle_initial TO middleInitial,
    RENAME COLUMN birth_date TO birthDate,
    RENAME COLUMN emergency_contact_name TO emergencyContactName,
    RENAME COLUMN emergency_contact_relationship TO emergencyContactRelationship,
    RENAME COLUMN emergency_contact_phone TO emergencyContactPhone,
    RENAME COLUMN emergency_contact_email TO emergencyContactEmail,
    RENAME COLUMN email_status TO emailStatus,
    RENAME COLUMN computer_use TO computerUse`,

  `ALTER TABLE member
    RENAME COLUMN person_id TO personId,
    RENAME COLUMN member_number TO memberNumber,
    RENAME COLUMN member_level TO memberLevel,
    RENAME COLUMN member_type TO memberType,
    RENAME COLUMN primary_person_id TO primaryPersonId,
    RENAME COLUMN secondary_type TO secondaryType,
    RENAME COLUMN service_notes TO serviceNotes,
    RENAME COLUMN join_date TO joinDate,
    RENAME COLUMN created_date TO createdDate,
    RENAME COLUMN drop_reason TO dropReason,
    RENAME COLUMN household_size TO householdSize,
    RENAME COLUMN household_dues TO householdDues,
    RENAME COLUMN quickbooks_key TO quickbooksKey,
    RENAME COLUMN printed_newsletter TO printedNewsletter,
    RENAME COLUMN confidential_notes TO confidentialNotes,
    RENAME COLUMN status_change_notes TO statusChangeNotes,
    RENAME COLUMN misc_notes TO miscNotes`,

  `ALTER TABLE volunteer
    RENAME COLUMN person_id TO personId,
    RENAME COLUMN provider_type TO providerType`,

  `ALTER TABLE volunteer_capability
    RENAME COLUMN volunteer_id TO volunteerId,
    RENAME COLUMN capability_id TO capabilityId`,

  `ALTER TABLE volunteer_vetting
    RENAME COLUMN volunteer_id TO volunteerId,
    RENAME COLUMN vetting_type_id TO vettingTypeId,
    RENAME COLUMN date_entered TO dateEntered,
    RENAME COLUMN date_expired TO dateExpired,
    RENAME COLUMN additional_data TO additionalData`,

  `ALTER TABLE person_disability
    RENAME COLUMN person_id TO personId,
    RENAME COLUMN disability_id TO disabilityId`,

  `ALTER TABLE service_request
    RENAME COLUMN request_number TO requestNumber,
    RENAME COLUMN village_id TO villageId,
    RENAME COLUMN member_person_id TO memberPersonId,
    RENAME COLUMN volunteer_person_id TO volunteerPersonId,
    RENAME COLUMN service_name TO serviceName,
    RENAME COLUMN transportation_type TO transportationType,
    RENAME COLUMN created_at TO createdAt,
    RENAME COLUMN start_at TO startAt,
    RENAME COLUMN finish_at TO finishAt,
    RENAME COLUMN appt_time TO apptTime,
    RENAME COLUMN return_time TO returnTime,
    RENAME COLUMN created_user_id TO createdUserId`,

  `ALTER TABLE notification_event
    RENAME COLUMN event_type TO eventType,
    RENAME COLUMN service_request_id TO serviceRequestId,
    RENAME COLUMN created_at TO createdAt,
    RENAME COLUMN sent_at TO sentAt,
    RENAME COLUMN failed_at TO failedAt`,

  `ALTER TABLE analytics_events
    RENAME COLUMN user_id TO userId,
    RENAME COLUMN event_type TO eventType,
    RENAME COLUMN route_name TO routeName,
    RENAME COLUMN event_name TO eventName,
    RENAME COLUMN created_at TO createdAt`,

  `CREATE OR REPLACE VIEW active_member AS SELECT * FROM member WHERE status = 'Active'`,
  `CREATE OR REPLACE VIEW active_volunteer AS SELECT * FROM volunteer WHERE active = 1`,
]

const downMigration = [
  `DROP VIEW IF EXISTS active_member`,
  `DROP VIEW IF EXISTS active_volunteer`,

  `ALTER TABLE analytics_events
    RENAME COLUMN userId TO user_id,
    RENAME COLUMN eventType TO event_type,
    RENAME COLUMN routeName TO route_name,
    RENAME COLUMN eventName TO event_name,
    RENAME COLUMN createdAt TO created_at`,

  `ALTER TABLE notification_event
    RENAME COLUMN eventType TO event_type,
    RENAME COLUMN serviceRequestId TO service_request_id,
    RENAME COLUMN createdAt TO created_at,
    RENAME COLUMN sentAt TO sent_at,
    RENAME COLUMN failedAt TO failed_at`,

  `ALTER TABLE service_request
    RENAME COLUMN requestNumber TO request_number,
    RENAME COLUMN villageId TO village_id,
    RENAME COLUMN memberPersonId TO member_person_id,
    RENAME COLUMN volunteerPersonId TO volunteer_person_id,
    RENAME COLUMN serviceName TO service_name,
    RENAME COLUMN transportationType TO transportation_type,
    RENAME COLUMN createdAt TO created_at,
    RENAME COLUMN startAt TO start_at,
    RENAME COLUMN finishAt TO finish_at,
    RENAME COLUMN apptTime TO appt_time,
    RENAME COLUMN returnTime TO return_time,
    RENAME COLUMN createdUserId TO created_user_id`,

  `ALTER TABLE person_disability
    RENAME COLUMN personId TO person_id,
    RENAME COLUMN disabilityId TO disability_id`,

  `ALTER TABLE volunteer_vetting
    RENAME COLUMN volunteerId TO volunteer_id,
    RENAME COLUMN vettingTypeId TO vetting_type_id,
    RENAME COLUMN dateEntered TO date_entered,
    RENAME COLUMN dateExpired TO date_expired,
    RENAME COLUMN additionalData TO additional_data`,

  `ALTER TABLE volunteer_capability
    RENAME COLUMN volunteerId TO volunteer_id,
    RENAME COLUMN capabilityId TO capability_id`,

  `ALTER TABLE volunteer
    RENAME COLUMN personId TO person_id,
    RENAME COLUMN providerType TO provider_type`,

  `ALTER TABLE member
    RENAME COLUMN personId TO person_id,
    RENAME COLUMN memberNumber TO member_number,
    RENAME COLUMN memberLevel TO member_level,
    RENAME COLUMN memberType TO member_type,
    RENAME COLUMN primaryPersonId TO primary_person_id,
    RENAME COLUMN secondaryType TO secondary_type,
    RENAME COLUMN serviceNotes TO service_notes,
    RENAME COLUMN joinDate TO join_date,
    RENAME COLUMN createdDate TO created_date,
    RENAME COLUMN dropReason TO drop_reason,
    RENAME COLUMN householdSize TO household_size,
    RENAME COLUMN householdDues TO household_dues,
    RENAME COLUMN quickbooksKey TO quickbooks_key,
    RENAME COLUMN printedNewsletter TO printed_newsletter,
    RENAME COLUMN confidentialNotes TO confidential_notes,
    RENAME COLUMN statusChangeNotes TO status_change_notes,
    RENAME COLUMN miscNotes TO misc_notes`,

  `ALTER TABLE person
    RENAME COLUMN villageId TO village_id,
    RENAME COLUMN fullName TO full_name,
    RENAME COLUMN lastName TO last_name,
    RENAME COLUMN firstName TO first_name,
    RENAME COLUMN middleInitial TO middle_initial,
    RENAME COLUMN birthDate TO birth_date,
    RENAME COLUMN emergencyContactName TO emergency_contact_name,
    RENAME COLUMN emergencyContactRelationship TO emergency_contact_relationship,
    RENAME COLUMN emergencyContactPhone TO emergency_contact_phone,
    RENAME COLUMN emergencyContactEmail TO emergency_contact_email,
    RENAME COLUMN emailStatus TO email_status,
    RENAME COLUMN computerUse TO computer_use`,

  `CREATE OR REPLACE VIEW active_member AS SELECT * FROM member WHERE status = 'Active'`,
  `CREATE OR REPLACE VIEW active_volunteer AS SELECT * FROM volunteer WHERE active = 1`,
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
