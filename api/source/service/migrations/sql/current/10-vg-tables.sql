-- MySQL dump 10.13  Distrib 8.4.2, for Linux (x86_64)
--
-- Host: 127.0.0.1    Database: vg
-- ------------------------------------------------------
-- Server version	8.4.2

/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `_migrations`
--

DROP TABLE IF EXISTS `_migrations`;
CREATE TABLE `_migrations` (
  `createdAt` datetime DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  `name` varchar(128) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Temporary view structure for view `active_member`
--

DROP TABLE IF EXISTS `active_member`;
/*!50001 DROP VIEW IF EXISTS `active_member`*/;
/*!50001 CREATE VIEW `active_member` AS SELECT 
 1 AS `id`,
 1 AS `personId`,
 1 AS `memberNumber`,
 1 AS `memberLevel`,
 1 AS `memberType`,
 1 AS `primaryPersonId`,
 1 AS `secondaryType`,
 1 AS `serviceNotes`,
 1 AS `joinDate`,
 1 AS `createdDate`,
 1 AS `status`,
 1 AS `dropReason`,
 1 AS `householdSize`,
 1 AS `householdDues`,
 1 AS `quickbooksKey`,
 1 AS `printedNewsletter`,
 1 AS `confidentialNotes`,
 1 AS `statusChangeNotes`,
 1 AS `miscNotes`*/;

--
-- Temporary view structure for view `active_volunteer`
--

DROP TABLE IF EXISTS `active_volunteer`;
/*!50001 DROP VIEW IF EXISTS `active_volunteer`*/;
/*!50001 CREATE VIEW `active_volunteer` AS SELECT 
 1 AS `id`,
 1 AS `personId`,
 1 AS `providerType`,
 1 AS `notes`,
 1 AS `active`*/;

--
-- Table structure for table `analytics_events`
--

DROP TABLE IF EXISTS `analytics_events`;
CREATE TABLE `analytics_events` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `userId` int unsigned NOT NULL,
  `eventType` varchar(32) NOT NULL,
  `routeName` varchar(64) DEFAULT NULL,
  `path` varchar(512) DEFAULT NULL,
  `eventName` varchar(64) DEFAULT NULL,
  `metadata` json DEFAULT NULL,
  `createdAt` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_analytics_user_time` (`userId`,`createdAt`),
  KEY `idx_analytics_route_time` (`eventType`,`routeName`,`createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Table structure for table `capability`
--

DROP TABLE IF EXISTS `capability`;
CREATE TABLE `capability` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Table structure for table `ce_dump`
--

DROP TABLE IF EXISTS `ce_dump`;
CREATE TABLE `ce_dump` (
  `ceDumpTime` datetime NOT NULL,
  PRIMARY KEY (`ceDumpTime`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Table structure for table `community`
--

DROP TABLE IF EXISTS `community`;
CREATE TABLE `community` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Table structure for table `disability`
--

DROP TABLE IF EXISTS `disability`;
CREATE TABLE `disability` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Table structure for table `enrollment_request`
--

DROP TABLE IF EXISTS `enrollment_request`;
CREATE TABLE `enrollment_request` (
  `id` int NOT NULL AUTO_INCREMENT,
  `email` varchar(200) NOT NULL,
  `personId` int DEFAULT NULL,
  `pinHash` char(60) DEFAULT NULL,
  `kind` varchar(32) DEFAULT NULL COMMENT 'new | existing_account',
  `outcome` varchar(32) NOT NULL COMMENT 'pin_sent | superseded | ineligible_member | not_found | kc_unavailable',
  `attempts` int NOT NULL DEFAULT '0',
  `resetAttempts` int NOT NULL DEFAULT '0',
  `expiresAt` datetime DEFAULT NULL,
  `consumedAt` datetime DEFAULT NULL,
  `resetAt` datetime DEFAULT NULL,
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `INDEX_er_email` (`email`),
  KEY `fk_enrollment_request_person` (`personId`),
  CONSTRAINT `fk_enrollment_request_person` FOREIGN KEY (`personId`) REFERENCES `person` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Table structure for table `fcv_submission`
--

DROP TABLE IF EXISTS `fcv_submission`;
CREATE TABLE `fcv_submission` (
  `id` bigint unsigned NOT NULL,
  `villageId` int DEFAULT NULL,
  `villageName` varchar(200) DEFAULT NULL,
  `volunteerPersonId` int DEFAULT NULL,
  `rawVolunteerName` varchar(200) DEFAULT NULL,
  `fuzzyVolunteerName` varchar(200) DEFAULT NULL,
  `memberPersonId` int DEFAULT NULL,
  `rawMemberName` varchar(200) DEFAULT NULL,
  `fuzzyMemberName` varchar(200) DEFAULT NULL,
  `visitDate` date NOT NULL,
  `timeSpentMinutes` int NOT NULL,
  `contactType` varchar(50) NOT NULL,
  `activityTypes` json DEFAULT NULL,
  `activityOther` varchar(500) DEFAULT NULL,
  `notes` text,
  `submittedAt` datetime NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_village` (`villageId`),
  KEY `idx_volunteer` (`volunteerPersonId`),
  KEY `idx_member` (`memberPersonId`),
  CONSTRAINT `fk_fcv_member` FOREIGN KEY (`memberPersonId`) REFERENCES `person` (`id`),
  CONSTRAINT `fk_fcv_village` FOREIGN KEY (`villageId`) REFERENCES `village` (`id`),
  CONSTRAINT `fk_fcv_volunteer` FOREIGN KEY (`volunteerPersonId`) REFERENCES `person` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Table structure for table `member`
--

DROP TABLE IF EXISTS `member`;
CREATE TABLE `member` (
  `id` int NOT NULL AUTO_INCREMENT,
  `personId` int NOT NULL,
  `memberNumber` varchar(50) DEFAULT NULL,
  `memberLevel` varchar(100) DEFAULT NULL,
  `memberType` varchar(50) DEFAULT NULL,
  `primaryPersonId` int DEFAULT NULL,
  `secondaryType` varchar(50) DEFAULT NULL,
  `serviceNotes` text,
  `joinDate` date DEFAULT NULL,
  `createdDate` date DEFAULT NULL,
  `status` varchar(50) DEFAULT NULL,
  `dropReason` varchar(100) DEFAULT NULL,
  `householdSize` tinyint DEFAULT NULL,
  `householdDues` decimal(10,2) DEFAULT NULL,
  `quickbooksKey` varchar(50) DEFAULT NULL,
  `printedNewsletter` bit(1) DEFAULT NULL,
  `confidentialNotes` text,
  `statusChangeNotes` text,
  `miscNotes` text,
  PRIMARY KEY (`id`),
  UNIQUE KEY `person_id` (`personId`),
  KEY `member_primary_person_fk` (`primaryPersonId`),
  CONSTRAINT `member_ibfk_1` FOREIGN KEY (`personId`) REFERENCES `person` (`id`),
  CONSTRAINT `member_primary_person_fk` FOREIGN KEY (`primaryPersonId`) REFERENCES `person` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Table structure for table `notification_event`
--

DROP TABLE IF EXISTS `notification_event`;
CREATE TABLE `notification_event` (
  `id` int NOT NULL AUTO_INCREMENT,
  `eventType` varchar(32) NOT NULL COMMENT 'open | confirmed | cancelled | reminder',
  `serviceRequestId` int DEFAULT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `sentAt` timestamp NULL DEFAULT NULL,
  `recipients` json DEFAULT NULL COMMENT 'Array of person ids notified, written by sidecar on send',
  `failedAt` timestamp NULL DEFAULT NULL,
  `payload` json DEFAULT NULL COMMENT 'Event-type-specific data for events not tied to a service request',
  PRIMARY KEY (`id`),
  KEY `fk_email_event_sr` (`serviceRequestId`),
  KEY `idx_email_event_pending` (`sentAt`,`createdAt`),
  CONSTRAINT `fk_email_event_sr` FOREIGN KEY (`serviceRequestId`) REFERENCES `service_request` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Table structure for table `person`
--

DROP TABLE IF EXISTS `person`;
CREATE TABLE `person` (
  `id` int NOT NULL AUTO_INCREMENT,
  `villageId` int DEFAULT NULL,
  `fullName` varchar(200) GENERATED ALWAYS AS (concat_ws(_utf8mb4', ',`lastName`,`firstName`)) STORED,
  `lastName` varchar(100) NOT NULL,
  `firstName` varchar(100) NOT NULL,
  `middleInitial` varchar(10) DEFAULT NULL,
  `salutation` varchar(20) DEFAULT NULL,
  `nickname` varchar(100) DEFAULT NULL,
  `street` varchar(200) DEFAULT NULL,
  `unit` varchar(100) DEFAULT NULL,
  `address` varchar(300) GENERATED ALWAYS AS (concat_ws(_utf8mb4', ',`street`,`unit`)) STORED,
  `city` varchar(100) DEFAULT NULL,
  `state` varchar(50) DEFAULT NULL,
  `zip` varchar(20) DEFAULT NULL,
  `email` varchar(200) DEFAULT NULL,
  `emailStatus` varchar(50) DEFAULT NULL,
  `phone` varchar(50) DEFAULT NULL,
  `cell` varchar(50) DEFAULT NULL,
  `computerUse` bit(1) DEFAULT NULL,
  `smartphone` bit(1) DEFAULT NULL,
  `birthDate` date DEFAULT NULL,
  `emergencyContactName` varchar(200) DEFAULT NULL,
  `emergencyContactRelationship` varchar(100) DEFAULT NULL,
  `emergencyContactPhone` varchar(50) DEFAULT NULL,
  `emergencyContactEmail` varchar(200) DEFAULT NULL,
  `comments` text,
  PRIMARY KEY (`id`),
  KEY `person_ibfk_1` (`villageId`),
  KEY `INDEX_email` (`email`),
  CONSTRAINT `person_ibfk_1` FOREIGN KEY (`villageId`) REFERENCES `village` (`id`),
  CONSTRAINT `person_names_non_empty` CHECK (((`lastName` <> _utf8mb4'') and (`firstName` <> _utf8mb4'')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Table structure for table `person_community`
--

DROP TABLE IF EXISTS `person_community`;
CREATE TABLE `person_community` (
  `id` int NOT NULL AUTO_INCREMENT,
  `personId` int NOT NULL,
  `communityId` int NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `person_community` (`personId`,`communityId`),
  KEY `pc_community_fk` (`communityId`),
  CONSTRAINT `pc_community_fk` FOREIGN KEY (`communityId`) REFERENCES `community` (`id`),
  CONSTRAINT `pc_person_fk` FOREIGN KEY (`personId`) REFERENCES `person` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Table structure for table `person_disability`
--

DROP TABLE IF EXISTS `person_disability`;
CREATE TABLE `person_disability` (
  `id` int NOT NULL AUTO_INCREMENT,
  `personId` int NOT NULL,
  `disabilityId` int NOT NULL,
  `note` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `person_disability` (`personId`,`disabilityId`),
  KEY `disability_id` (`disabilityId`),
  CONSTRAINT `person_disability_ibfk_1` FOREIGN KEY (`personId`) REFERENCES `person` (`id`),
  CONSTRAINT `person_disability_ibfk_2` FOREIGN KEY (`disabilityId`) REFERENCES `disability` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Table structure for table `privacy_acknowledgement`
--

DROP TABLE IF EXISTS `privacy_acknowledgement`;
CREATE TABLE `privacy_acknowledgement` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `rulesId` int NOT NULL,
  `acknowledgedAt` datetime NOT NULL,
  `tokenClaims` json NOT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_privacy_ack_user` (`userId`),
  KEY `fk_privacy_ack_rules` (`rulesId`),
  CONSTRAINT `fk_privacy_ack_rules` FOREIGN KEY (`rulesId`) REFERENCES `privacy_rules` (`id`),
  CONSTRAINT `fk_privacy_ack_user` FOREIGN KEY (`userId`) REFERENCES `user_data` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Table structure for table `privacy_rules`
--

DROP TABLE IF EXISTS `privacy_rules`;
CREATE TABLE `privacy_rules` (
  `id` int NOT NULL AUTO_INCREMENT,
  `content` mediumtext NOT NULL,
  `publishedAt` datetime NOT NULL,
  `publishedByUserId` int NOT NULL,
  `modifiedAt` datetime DEFAULT NULL,
  `modifiedByUserId` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_privacy_rules_publisher` (`publishedByUserId`),
  KEY `fk_privacy_rules_modifier` (`modifiedByUserId`),
  CONSTRAINT `fk_privacy_rules_modifier` FOREIGN KEY (`modifiedByUserId`) REFERENCES `user_data` (`userId`),
  CONSTRAINT `fk_privacy_rules_publisher` FOREIGN KEY (`publishedByUserId`) REFERENCES `user_data` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Table structure for table `role`
--

DROP TABLE IF EXISTS `role`;
CREATE TABLE `role` (
  `roleId` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `scope` enum('federation','village') NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `isSystem` tinyint NOT NULL DEFAULT '0',
  PRIMARY KEY (`roleId`),
  UNIQUE KEY `idx_role_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Table structure for table `role_grant`
--

DROP TABLE IF EXISTS `role_grant`;
CREATE TABLE `role_grant` (
  `grantId` int NOT NULL AUTO_INCREMENT,
  `userId` int DEFAULT NULL,
  `userGroupId` int DEFAULT NULL,
  `roleId` int NOT NULL,
  `villageId` int DEFAULT NULL,
  `villageKey` int GENERATED ALWAYS AS (ifnull(`villageId`,0)) VIRTUAL,
  PRIMARY KEY (`grantId`),
  UNIQUE KEY `idx_rg_user` (`userId`,`roleId`,`villageKey`),
  UNIQUE KEY `idx_rg_group` (`userGroupId`,`roleId`,`villageKey`),
  KEY `idx_rg_village` (`villageId`,`roleId`),
  KEY `fk_role_grant_role` (`roleId`),
  CONSTRAINT `fk_role_grant_group` FOREIGN KEY (`userGroupId`) REFERENCES `user_group` (`userGroupId`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_role_grant_role` FOREIGN KEY (`roleId`) REFERENCES `role` (`roleId`),
  CONSTRAINT `fk_role_grant_user` FOREIGN KEY (`userId`) REFERENCES `user_data` (`userId`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_role_grant_village` FOREIGN KEY (`villageId`) REFERENCES `village` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Table structure for table `role_permission`
--

DROP TABLE IF EXISTS `role_permission`;
CREATE TABLE `role_permission` (
  `roleId` int NOT NULL,
  `permission` varchar(100) NOT NULL,
  PRIMARY KEY (`roleId`,`permission`),
  CONSTRAINT `fk_role_permission_role` FOREIGN KEY (`roleId`) REFERENCES `role` (`roleId`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Table structure for table `service_request`
--

DROP TABLE IF EXISTS `service_request`;
CREATE TABLE `service_request` (
  `id` int NOT NULL AUTO_INCREMENT,
  `requestNumber` int DEFAULT NULL,
  `villageId` int NOT NULL,
  `memberPersonId` int DEFAULT NULL,
  `volunteerPersonId` int DEFAULT NULL,
  `status` varchar(50) NOT NULL,
  `serviceName` varchar(200) DEFAULT NULL,
  `transportationType` varchar(100) DEFAULT NULL,
  `createdAt` datetime DEFAULT NULL,
  `serviceDate` date DEFAULT NULL,
  `timesFlexible` tinyint(1) NOT NULL DEFAULT '0',
  `startTime` time DEFAULT NULL,
  `finishTime` time DEFAULT NULL,
  `apptTime` time DEFAULT NULL,
  `returnTime` time DEFAULT NULL,
  `instructions` text,
  `description` text,
  `destination` text,
  `address` text,
  `city` varchar(100) DEFAULT NULL,
  `phone` varchar(50) DEFAULT NULL,
  `state` varchar(50) DEFAULT NULL,
  `zip` varchar(20) DEFAULT NULL,
  `createdUserId` int DEFAULT NULL,
  `modifiedUserId` int DEFAULT NULL,
  `modifiedAt` datetime DEFAULT NULL,
  `start` text,
  `startAddress` text,
  `startCity` varchar(100) DEFAULT NULL,
  `startState` varchar(50) DEFAULT NULL,
  `startZip` varchar(20) DEFAULT NULL,
  `startPhone` varchar(50) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `village_id` (`villageId`),
  KEY `member_person_id` (`memberPersonId`),
  KEY `volunteer_person_id` (`volunteerPersonId`),
  KEY `fk_service_request_created_user` (`createdUserId`),
  KEY `idx_sr_village_date_status` (`villageId`,`serviceDate`,`status`),
  KEY `fk_service_request_modified_user` (`modifiedUserId`),
  CONSTRAINT `fk_service_request_created_user` FOREIGN KEY (`createdUserId`) REFERENCES `user_data` (`userId`),
  CONSTRAINT `fk_service_request_modified_user` FOREIGN KEY (`modifiedUserId`) REFERENCES `user_data` (`userId`),
  CONSTRAINT `service_request_ibfk_1` FOREIGN KEY (`villageId`) REFERENCES `village` (`id`),
  CONSTRAINT `service_request_ibfk_2` FOREIGN KEY (`memberPersonId`) REFERENCES `person` (`id`),
  CONSTRAINT `service_request_ibfk_3` FOREIGN KEY (`volunteerPersonId`) REFERENCES `person` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Table structure for table `user_data`
--

DROP TABLE IF EXISTS `user_data`;
CREATE TABLE `user_data` (
  `userId` int NOT NULL AUTO_INCREMENT,
  `username` varchar(255) NOT NULL,
  `created` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `lastAccess` int DEFAULT NULL,
  `lastClaims` json DEFAULT (_utf8mb4'{}'),
  `status` enum('available','unavailable') NOT NULL DEFAULT 'available',
  `statusDate` datetime NOT NULL DEFAULT (`created`),
  `statusUser` int DEFAULT NULL,
  `webPreferences` json NOT NULL DEFAULT (_utf8mb4'{"darkMode": true, "lastWhatsNew": "2000-01-01"}'),
  PRIMARY KEY (`userId`),
  UNIQUE KEY `INDEX_username` (`username`),
  KEY `INDEX_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Table structure for table `user_group`
--

DROP TABLE IF EXISTS `user_group`;
CREATE TABLE `user_group` (
  `userGroupId` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `createdUserId` int NOT NULL,
  `createdDate` datetime DEFAULT CURRENT_TIMESTAMP,
  `modifiedUserId` int NOT NULL,
  `modifiedDate` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`userGroupId`),
  UNIQUE KEY `idx_name` (`name`),
  KEY `fk_user_group_1_idx` (`createdUserId`),
  KEY `fk_user_group_2_idx` (`modifiedUserId`),
  CONSTRAINT `fk_user_group_1` FOREIGN KEY (`createdUserId`) REFERENCES `user_data` (`userId`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_user_group_2` FOREIGN KEY (`modifiedUserId`) REFERENCES `user_data` (`userId`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Table structure for table `user_group_user_map`
--

DROP TABLE IF EXISTS `user_group_user_map`;
CREATE TABLE `user_group_user_map` (
  `ugumId` int NOT NULL AUTO_INCREMENT,
  `userGroupId` int NOT NULL,
  `userId` int NOT NULL,
  PRIMARY KEY (`ugumId`),
  UNIQUE KEY `INDEX_UG_USER` (`userGroupId`,`userId`),
  KEY `fk_user_group_map_2_idx` (`userId`),
  CONSTRAINT `fk_user_group_map_1` FOREIGN KEY (`userGroupId`) REFERENCES `user_group` (`userGroupId`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_user_group_map_2` FOREIGN KEY (`userId`) REFERENCES `user_data` (`userId`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Table structure for table `vetting_type`
--

DROP TABLE IF EXISTS `vetting_type`;
CREATE TABLE `vetting_type` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Table structure for table `village`
--

DROP TABLE IF EXISTS `village`;
CREATE TABLE `village` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(200) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Table structure for table `volunteer`
--

DROP TABLE IF EXISTS `volunteer`;
CREATE TABLE `volunteer` (
  `id` int NOT NULL AUTO_INCREMENT,
  `personId` int NOT NULL,
  `providerType` varchar(50) DEFAULT NULL,
  `active` bit(1) DEFAULT NULL,
  `notes` text,
  PRIMARY KEY (`id`),
  UNIQUE KEY `person_id` (`personId`),
  CONSTRAINT `volunteer_ibfk_1` FOREIGN KEY (`personId`) REFERENCES `person` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Table structure for table `volunteer_capability`
--

DROP TABLE IF EXISTS `volunteer_capability`;
CREATE TABLE `volunteer_capability` (
  `id` int NOT NULL AUTO_INCREMENT,
  `volunteerId` int NOT NULL,
  `capabilityId` int NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `volunteer_capability_natural` (`volunteerId`,`capabilityId`),
  KEY `capability_id` (`capabilityId`),
  CONSTRAINT `volunteer_capability_ibfk_1` FOREIGN KEY (`volunteerId`) REFERENCES `volunteer` (`id`),
  CONSTRAINT `volunteer_capability_ibfk_2` FOREIGN KEY (`capabilityId`) REFERENCES `capability` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Table structure for table `volunteer_vetting`
--

DROP TABLE IF EXISTS `volunteer_vetting`;
CREATE TABLE `volunteer_vetting` (
  `id` int NOT NULL AUTO_INCREMENT,
  `volunteerId` int NOT NULL,
  `vettingTypeId` int NOT NULL,
  `dateEntered` date DEFAULT NULL,
  `dateExpired` date DEFAULT NULL,
  `additionalData` varchar(100) DEFAULT NULL,
  `notes` text,
  PRIMARY KEY (`id`),
  UNIQUE KEY `volunteer_vetting_natural` (`volunteerId`,`vettingTypeId`,`dateEntered`),
  KEY `vetting_type_id` (`vettingTypeId`),
  CONSTRAINT `volunteer_vetting_ibfk_1` FOREIGN KEY (`volunteerId`) REFERENCES `volunteer` (`id`),
  CONSTRAINT `volunteer_vetting_ibfk_2` FOREIGN KEY (`vettingTypeId`) REFERENCES `vetting_type` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Table structure for table `volunteer_village_associate`
--

DROP TABLE IF EXISTS `volunteer_village_associate`;
CREATE TABLE `volunteer_village_associate` (
  `id` int NOT NULL AUTO_INCREMENT,
  `volunteerId` int NOT NULL,
  `villageId` int NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `volunteer_village` (`volunteerId`,`villageId`),
  KEY `vva_village_fk` (`villageId`),
  CONSTRAINT `vva_village_fk` FOREIGN KEY (`villageId`) REFERENCES `village` (`id`),
  CONSTRAINT `vva_volunteer_fk` FOREIGN KEY (`volunteerId`) REFERENCES `volunteer` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Dumping events for database 'vg'
--
/*!50106 SET @save_time_zone= @@TIME_ZONE */ ;
/*!50106 DROP EVENT IF EXISTS `evt_auto_complete_service_requests` */;
DELIMITER $
/*!50003 SET @saved_col_connection = @@collation_connection */ $
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ $
/*!50003 SET @saved_sql_mode       = @@sql_mode */ $
/*!50003 SET sql_mode              = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ $
/*!50003 SET @saved_time_zone      = @@time_zone */ $
/*!50003 SET time_zone             = 'SYSTEM' */ $
/*!50106 CREATE*/ /*!50117 */ /*!50106 EVENT `evt_auto_complete_service_requests` ON SCHEDULE EVERY 1 DAY STARTS '2026-07-07 05:01:00' ON COMPLETION NOT PRESERVE ENABLE DO BEGIN
          UPDATE service_request SET `status` = 'Completed'
          WHERE `status` = 'Confirmed' AND serviceDate <= CURDATE() - INTERVAL 1 DAY;

          UPDATE service_request SET `status` = 'Unmatched'
          WHERE `status` = 'Open' AND serviceDate <= CURDATE() - INTERVAL 1 DAY;
        END */ $
/*!50003 SET time_zone             = @saved_time_zone */ $
/*!50003 SET sql_mode              = @saved_sql_mode */ $
/*!50003 SET collation_connection  = @saved_col_connection */ $
DELIMITER ;
/*!50106 SET TIME_ZONE= @save_time_zone */ ;

--
-- Dumping routines for database 'vg'
--

--
-- Final view structure for view `active_member`
--

/*!50001 DROP VIEW IF EXISTS `active_member`*/;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50001 VIEW `active_member` AS select `member`.`id` AS `id`,`member`.`personId` AS `personId`,`member`.`memberNumber` AS `memberNumber`,`member`.`memberLevel` AS `memberLevel`,`member`.`memberType` AS `memberType`,`member`.`primaryPersonId` AS `primaryPersonId`,`member`.`secondaryType` AS `secondaryType`,`member`.`serviceNotes` AS `serviceNotes`,`member`.`joinDate` AS `joinDate`,`member`.`createdDate` AS `createdDate`,`member`.`status` AS `status`,`member`.`dropReason` AS `dropReason`,`member`.`householdSize` AS `householdSize`,`member`.`householdDues` AS `householdDues`,`member`.`quickbooksKey` AS `quickbooksKey`,`member`.`printedNewsletter` AS `printedNewsletter`,`member`.`confidentialNotes` AS `confidentialNotes`,`member`.`statusChangeNotes` AS `statusChangeNotes`,`member`.`miscNotes` AS `miscNotes` from `member` where (`member`.`status` = 'Active') */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `active_volunteer`
--

/*!50001 DROP VIEW IF EXISTS `active_volunteer`*/;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50001 VIEW `active_volunteer` AS select `volunteer`.`id` AS `id`,`volunteer`.`personId` AS `personId`,`volunteer`.`providerType` AS `providerType`,`volunteer`.`notes` AS `notes`,`volunteer`.`active` AS `active` from `volunteer` where (`volunteer`.`active` = 1) */;
/*!50001 SET collation_connection      = @saved_col_connection */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-07-20 22:34:52
