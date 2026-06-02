CREATE TABLE IF NOT EXISTS village (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(200) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS capability (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE
);

INSERT IGNORE INTO capability (name) VALUES
  ('Errands'),
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
  join_date DATE,
  UNIQUE(village_id, full_name),
  FOREIGN KEY (village_id) REFERENCES village(id)
);

CREATE TABLE IF NOT EXISTS member (
  id INT AUTO_INCREMENT PRIMARY KEY,
  person_id INT NOT NULL UNIQUE,
  member_number VARCHAR(50),
  member_level VARCHAR(100),
  service_notes TEXT,
  emergency_contact_name VARCHAR(200),
  emergency_contact_relationship VARCHAR(100),
  emergency_contact_phone VARCHAR(50),
  emergency_contact_email VARCHAR(200),
  FOREIGN KEY (person_id) REFERENCES person(id)
);

CREATE TABLE IF NOT EXISTS volunteer (
  id INT AUTO_INCREMENT PRIMARY KEY,
  person_id INT NOT NULL UNIQUE,
  emergency_phone VARCHAR(50),
  FOREIGN KEY (person_id) REFERENCES person(id)
);

CREATE TABLE IF NOT EXISTS volunteer_capability (
  id INT AUTO_INCREMENT PRIMARY KEY,
  volunteer_id INT NOT NULL,
  capability_id INT NOT NULL,
  FOREIGN KEY (volunteer_id) REFERENCES volunteer(id),
  FOREIGN KEY (capability_id) REFERENCES capability(id)
);

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
);

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
);
