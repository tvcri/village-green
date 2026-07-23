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
-- Dumping data for table `role`
--

LOCK TABLES `role` WRITE;
/*!40000 ALTER TABLE `role` DISABLE KEYS */;
INSERT INTO `role` VALUES (1,'Local Service Coordinator','village','Coordinates services within a village',1),(2,'Steering Committee','village','Village governance; read access',1),(3,'Village Lead','village','Leads a village; read access now, writes planned',1),(4,'Admin','federation','Application administrator',1),(5,'Staff','federation','Hub staff; full operational read/write',1),(6,'Board','federation','Board member; federation-wide redacted visibility',1),(7,'Service Coordinator','federation','Federation-wide service request coordination',1);
/*!40000 ALTER TABLE `role` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Dumping data for table `role_permission`
--

LOCK TABLES `role_permission` WRITE;
/*!40000 ALTER TABLE `role_permission` DISABLE KEYS */;
INSERT INTO `role_permission` VALUES (1,'friend:read'),(1,'member:read'),(1,'person:read'),(1,'sr:read'),(1,'village:read'),(1,'volunteer:read'),(2,'friend:read'),(2,'member:read'),(2,'person:read'),(2,'sr:read'),(2,'village:read'),(2,'volunteer:read'),(3,'friend:read'),(3,'member:read'),(3,'member:read_financial'),(3,'person:read'),(3,'sr:read'),(3,'village:read'),(3,'volunteer:read'),(4,'*'),(5,'friend:read'),(5,'friend:write'),(5,'member:read'),(5,'member:read_financial'),(5,'member:read_inactive'),(5,'member:write'),(5,'person:read'),(5,'person:read_confidential'),(5,'person:write'),(5,'sr:read'),(5,'sr:write'),(5,'village:read'),(5,'village:write'),(5,'volunteer:read'),(5,'volunteer:read_inactive'),(5,'volunteer:write'),(6,'friend:read'),(6,'member:read'),(6,'person:read'),(6,'sr:read'),(6,'village:read'),(6,'volunteer:read'),(7,'friend:read'),(7,'member:read'),(7,'person:read'),(7,'person:read_confidential'),(7,'sr:read'),(7,'sr:write'),(7,'village:read'),(7,'volunteer:read');
/*!40000 ALTER TABLE `role_permission` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Dumping data for table `_migrations`
--

LOCK TABLES `_migrations` WRITE;
/*!40000 ALTER TABLE `_migrations` DISABLE KEYS */;
INSERT INTO `_migrations` VALUES ('2026-06-16 17:43:42',NULL,'0001-analytics.js'),('2026-06-22 01:13:42',NULL,'0002-fcv-submission.js'),('2026-06-23 06:26:22',NULL,'0003-service-request-times.js'),('2026-06-23 20:15:07',NULL,'0004-service-request-status-not-null.js'),('2026-06-29 01:59:50',NULL,'0005-notification-event.js'),('2026-06-29 17:19:50',NULL,'0006-ce-member-volunteer-fields.js'),('2026-07-02 20:07:56',NULL,'0007-service-request-attribution.js'),('2026-07-04 02:23:43',NULL,'0008-privacy-acknowledgement.js'),('2026-07-05 15:28:31',NULL,'0009-camelcase-columns.js'),('2026-07-06 14:36:41',NULL,'0010-person-management.js'),('2026-07-06 14:36:41',NULL,'0011-person-disability-note.js'),('2026-07-06 14:36:41',NULL,'0012-volunteer-notes.js'),('2026-07-12 17:23:03',NULL,'0013-rbac-roles.js'),('2026-07-13 11:32:58',NULL,'0014-sr-wallclock-times.js'),('2026-07-13 16:44:26',NULL,'0015-sr-village-date-status-index.js'),('2026-07-20 12:40:51',NULL,'0016-vss-identity.js'),('2026-07-20 12:40:52',NULL,'0017-enrollment.js'),('2026-07-23 01:02:22',NULL,'0018-sr-starting-address.js');
/*!40000 ALTER TABLE `_migrations` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-07-23  1:04:47
