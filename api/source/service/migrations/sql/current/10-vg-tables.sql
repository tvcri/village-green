CREATE TABLE IF NOT EXISTS village (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(200) NOT NULL UNIQUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS capability (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT IGNORE INTO capability (name) VALUES
  ('Errands'),
  ('Friends'),
  ('Home Help'),
  ('Tech Support'),
  ('Rides');

CREATE TABLE IF NOT EXISTS person (
  id INT AUTO_INCREMENT PRIMARY KEY,
  village_id INT NOT NULL,
  full_name VARCHAR(200) NOT NULL,
  last_name VARCHAR(100),
  first_name VARCHAR(100),
  nickname VARCHAR(100),
  address VARCHAR(300),
  city VARCHAR(100),
  state VARCHAR(50),
  zip VARCHAR(20),
  email VARCHAR(200),
  phone VARCHAR(50),
  cell VARCHAR(50),
  birth_date DATE,
  emergency_contact_name VARCHAR(200),
  emergency_contact_relationship VARCHAR(100),
  emergency_contact_phone VARCHAR(50),
  emergency_contact_email VARCHAR(200),
  UNIQUE(village_id, full_name),
  FOREIGN KEY (village_id) REFERENCES village(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS member (
  id INT AUTO_INCREMENT PRIMARY KEY,
  person_id INT NOT NULL UNIQUE,
  member_number VARCHAR(50),
  member_level VARCHAR(100),
  service_notes TEXT,
  join_date DATE,
  FOREIGN KEY (person_id) REFERENCES person(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS volunteer (
  id INT AUTO_INCREMENT PRIMARY KEY,
  person_id INT NOT NULL UNIQUE,
  FOREIGN KEY (person_id) REFERENCES person(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS volunteer_capability (
  id INT AUTO_INCREMENT PRIMARY KEY,
  volunteer_id INT NOT NULL,
  capability_id INT NOT NULL,
  FOREIGN KEY (volunteer_id) REFERENCES volunteer(id),
  FOREIGN KEY (capability_id) REFERENCES capability(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS service_request (
  id INT AUTO_INCREMENT PRIMARY KEY,
  request_number INT,
  village_id INT NOT NULL,
  member_person_id INT,
  volunteer_person_id INT,
  status VARCHAR(50),
  service_name VARCHAR(200),
  transportation_type VARCHAR(100),
  created_at DATETIME,
  start_at DATETIME,
  finish_at DATETIME,
  instructions TEXT,
  description TEXT,
  destination TEXT,
  address TEXT,
  city VARCHAR(100),
  phone VARCHAR(50),
  FOREIGN KEY (village_id) REFERENCES village(id),
  FOREIGN KEY (member_person_id) REFERENCES person(id),
  FOREIGN KEY (volunteer_person_id) REFERENCES person(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


CREATE TABLE IF NOT EXISTS user_data (
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

CREATE TABLE IF NOT EXISTS `user_group` (
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

CREATE TABLE IF NOT EXISTS `user_group_user_map` (
  `ugumId` int NOT NULL AUTO_INCREMENT,
  `userGroupId` int NOT NULL,
  `userId` int NOT NULL,
  PRIMARY KEY (`ugumId`),
  UNIQUE KEY `INDEX_UG_USER` (`userGroupId`,`userId`),
  KEY `fk_user_group_map_2_idx` (`userId`),
  CONSTRAINT `fk_user_group_map_1` FOREIGN KEY (`userGroupId`) REFERENCES `user_group` (`userGroupId`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_user_group_map_2` FOREIGN KEY (`userId`) REFERENCES `user_data` (`userId`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `village_grant` (
  `grantId` int NOT NULL AUTO_INCREMENT,
  `villageId` int NOT NULL,
  `userId` int DEFAULT NULL,
  `userGroupId` int DEFAULT NULL,
  `roleId` int NOT NULL,
  PRIMARY KEY (`grantId`),
  UNIQUE KEY `INDEX_USER` (`userId`,`villageId`),
  UNIQUE KEY `INDEX_USER_GROUP` (`userGroupId`,`villageId`),
  KEY `INDEX_VILLAGE` (`villageId`,`roleId`),
  CONSTRAINT `fk_village_grant_1` FOREIGN KEY (`userId`) REFERENCES `user_data` (`userId`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_village_grant_2` FOREIGN KEY (`villageId`) REFERENCES `village` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_village_grant_3` FOREIGN KEY (`userGroupId`) REFERENCES `user_group` (`userGroupId`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `ce_dump` (
  `ceDumpTime` DATETIME NOT NULL,
  PRIMARY KEY (`ceDumpTime`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
