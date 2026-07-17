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
-- Dumping data for table `capability`
--

LOCK TABLES `capability` WRITE;
/*!40000 ALTER TABLE `capability` DISABLE KEYS */;
INSERT INTO `capability` VALUES (1,'Errands'),(2,'Friends'),(3,'Home Help'),(5,'Rides'),(11,'Steering Committee'),(4,'Tech Support');
/*!40000 ALTER TABLE `capability` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Dumping data for table `_migrations`
--

LOCK TABLES `_migrations` WRITE;
/*!40000 ALTER TABLE `_migrations` DISABLE KEYS */;
INSERT INTO `_migrations` VALUES ('2026-06-16 17:43:42',NULL,'0001-analytics.js'),('2026-06-22 01:13:42',NULL,'0002-fcv-submission.js'),('2026-06-23 06:26:22',NULL,'0003-service-request-times.js'),('2026-06-23 20:15:07',NULL,'0004-service-request-status-not-null.js'),('2026-06-29 01:59:50',NULL,'0005-notification-event.js'),('2026-06-29 17:19:50',NULL,'0006-ce-member-volunteer-fields.js'),('2026-07-02 20:07:56',NULL,'0007-service-request-attribution.js'),('2026-07-04 02:23:43',NULL,'0008-privacy-acknowledgement.js'),('2026-07-05 15:28:31',NULL,'0009-camelcase-columns.js'),('2026-07-06 14:36:41',NULL,'0010-person-management.js'),('2026-07-06 14:36:41',NULL,'0011-person-disability-note.js'),('2026-07-06 14:36:41',NULL,'0012-volunteer-notes.js'),('2026-07-12 17:23:03',NULL,'0013-rbac-roles.js'),('2026-07-13 11:32:58',NULL,'0014-sr-wallclock-times.js'),('2026-07-13 16:44:26',NULL,'0015-sr-village-date-status-index.js'),('2026-07-16 23:13:10',NULL,'0016-sr-starting-address.js');
/*!40000 ALTER TABLE `_migrations` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-07-17 11:01:29
