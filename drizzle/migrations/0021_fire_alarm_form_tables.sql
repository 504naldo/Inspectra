-- Migration 0021: Fire alarm compliance form tables
-- Creates fire_alarm_form_header, fire_alarm_attendance_log, fire_alarm_ancillary_circuits
-- Also seeds Section 13 (FSRC Interconnection) checklist items

CREATE TABLE IF NOT EXISTS `fire_alarm_form_header` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `jobId` INT NOT NULL UNIQUE,
  `inspectionDate` DATE NULL,
  `systemManufacturer` VARCHAR(255) NULL,
  `systemModel` VARCHAR(255) NULL,
  `systemSerialNo` VARCHAR(100) NULL,
  `systemInstallYear` VARCHAR(10) NULL,
  `operationType` VARCHAR(100) NULL,
  `connectedToFSRC` TINYINT(1) NOT NULL DEFAULT 0,
  `fsrcName` VARCHAR(255) NULL,
  `fsrcPhone` VARCHAR(50) NULL,
  `fsrcAccountNo` VARCHAR(100) NULL,
  `techName` VARCHAR(255) NULL,
  `techCertNo` VARCHAR(100) NULL,
  `techCertLevel` VARCHAR(255) NULL,
  `techCompany` VARCHAR(255) NULL,
  `recommendations` TEXT NULL,
  `sectionHeaderValues` JSON NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS `fire_alarm_attendance_log` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `jobId` INT NOT NULL,
  `rowOrder` INT NOT NULL DEFAULT 0,
  `techName` VARCHAR(255) NULL,
  `certNo` VARCHAR(100) NULL,
  `attendanceDate` DATE NULL,
  `timeIn` VARCHAR(20) NULL,
  `timeOut` VARCHAR(20) NULL,
  `notes` TEXT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS `fire_alarm_ancillary_circuits` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `jobId` INT NOT NULL,
  `rowOrder` INT NOT NULL DEFAULT 0,
  `circuitDescription` VARCHAR(500) NULL,
  `circuitType` VARCHAR(100) NULL,
  `poweredBy` VARCHAR(255) NULL,
  `operationConfirmed` ENUM('yes','no','na') NOT NULL DEFAULT 'na',
  `confirmationMethod` VARCHAR(255) NULL,
  `notes` TEXT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Section 13: FSRC Interconnection (CAN/ULC-S536 Annex)
-- Only insert if section 13 items don't already exist
INSERT INTO `fire_alarm_checklist_templates`
  (`sectionName`, `sectionOrder`, `itemLetter`, `itemDescription`, `requirementType`, `inputType`,
   `isRequired`, `hasSubItems`, `notApplicableNote`,
   `standardId`, `standardVersion`, `effectiveDate`, `isActive`)
SELECT * FROM (SELECT
  'Fire Signal Receiving Centre (FSRC) Interconnection' AS sectionName,
  13 AS sectionOrder,
  'A' AS itemLetter,
  'Verify that the fire alarm system is connected to an approved FSRC as required by the applicable codes.' AS itemDescription,
  'test' AS requirementType,
  'checkbox' AS inputType,
  1 AS isRequired,
  0 AS hasSubItems,
  'Not connected to a Fire Signal Receiving Centre.' AS notApplicableNote,
  'ulc_s536' AS standardId,
  '2019' AS standardVersion,
  '2019-01-01' AS effectiveDate,
  1 AS isActive
) AS tmp WHERE NOT EXISTS (
  SELECT 1 FROM `fire_alarm_checklist_templates` WHERE `sectionOrder` = 13 AND `itemLetter` = 'A'
);

INSERT INTO `fire_alarm_checklist_templates`
  (`sectionName`, `sectionOrder`, `itemLetter`, `itemDescription`, `requirementType`, `inputType`,
   `isRequired`, `hasSubItems`, `notApplicableNote`,
   `standardId`, `standardVersion`, `effectiveDate`, `isActive`)
SELECT * FROM (SELECT
  'Fire Signal Receiving Centre (FSRC) Interconnection' AS sectionName,
  13 AS sectionOrder,
  'B' AS itemLetter,
  'Confirm FSRC account number, contact information, and monitoring agreement are current and on file.' AS itemDescription,
  'test' AS requirementType,
  'checkbox' AS inputType,
  1 AS isRequired,
  0 AS hasSubItems,
  NULL AS notApplicableNote,
  'ulc_s536' AS standardId,
  '2019' AS standardVersion,
  '2019-01-01' AS effectiveDate,
  1 AS isActive
) AS tmp WHERE NOT EXISTS (
  SELECT 1 FROM `fire_alarm_checklist_templates` WHERE `sectionOrder` = 13 AND `itemLetter` = 'B'
);

INSERT INTO `fire_alarm_checklist_templates`
  (`sectionName`, `sectionOrder`, `itemLetter`, `itemDescription`, `requirementType`, `inputType`,
   `isRequired`, `hasSubItems`, `notApplicableNote`,
   `standardId`, `standardVersion`, `effectiveDate`, `isActive`)
SELECT * FROM (SELECT
  'Fire Signal Receiving Centre (FSRC) Interconnection' AS sectionName,
  13 AS sectionOrder,
  'C' AS itemLetter,
  'Signal transmission to FSRC confirmed (alarm signal received and acknowledged by FSRC during test).' AS itemDescription,
  'test' AS requirementType,
  'checkbox' AS inputType,
  1 AS isRequired,
  0 AS hasSubItems,
  NULL AS notApplicableNote,
  'ulc_s536' AS standardId,
  '2019' AS standardVersion,
  '2019-01-01' AS effectiveDate,
  1 AS isActive
) AS tmp WHERE NOT EXISTS (
  SELECT 1 FROM `fire_alarm_checklist_templates` WHERE `sectionOrder` = 13 AND `itemLetter` = 'C'
);

INSERT INTO `fire_alarm_checklist_templates`
  (`sectionName`, `sectionOrder`, `itemLetter`, `itemDescription`, `requirementType`, `inputType`,
   `isRequired`, `hasSubItems`, `notApplicableNote`,
   `standardId`, `standardVersion`, `effectiveDate`, `isActive`)
SELECT * FROM (SELECT
  'Fire Signal Receiving Centre (FSRC) Interconnection' AS sectionName,
  13 AS sectionOrder,
  'D' AS itemLetter,
  'Supervisory signal transmission to FSRC confirmed.' AS itemDescription,
  'test' AS requirementType,
  'checkbox' AS inputType,
  1 AS isRequired,
  0 AS hasSubItems,
  NULL AS notApplicableNote,
  'ulc_s536' AS standardId,
  '2019' AS standardVersion,
  '2019-01-01' AS effectiveDate,
  1 AS isActive
) AS tmp WHERE NOT EXISTS (
  SELECT 1 FROM `fire_alarm_checklist_templates` WHERE `sectionOrder` = 13 AND `itemLetter` = 'D'
);

INSERT INTO `fire_alarm_checklist_templates`
  (`sectionName`, `sectionOrder`, `itemLetter`, `itemDescription`, `requirementType`, `inputType`,
   `isRequired`, `hasSubItems`, `notApplicableNote`,
   `standardId`, `standardVersion`, `effectiveDate`, `isActive`)
SELECT * FROM (SELECT
  'Fire Signal Receiving Centre (FSRC) Interconnection' AS sectionName,
  13 AS sectionOrder,
  'E' AS itemLetter,
  'Trouble signal transmission to FSRC confirmed.' AS itemDescription,
  'test' AS requirementType,
  'checkbox' AS inputType,
  1 AS isRequired,
  0 AS hasSubItems,
  NULL AS notApplicableNote,
  'ulc_s536' AS standardId,
  '2019' AS standardVersion,
  '2019-01-01' AS effectiveDate,
  1 AS isActive
) AS tmp WHERE NOT EXISTS (
  SELECT 1 FROM `fire_alarm_checklist_templates` WHERE `sectionOrder` = 13 AND `itemLetter` = 'E'
);

INSERT INTO `fire_alarm_checklist_templates`
  (`sectionName`, `sectionOrder`, `itemLetter`, `itemDescription`, `requirementType`, `inputType`,
   `isRequired`, `hasSubItems`, `notApplicableNote`,
   `standardId`, `standardVersion`, `effectiveDate`, `isActive`)
SELECT * FROM (SELECT
  'Fire Signal Receiving Centre (FSRC) Interconnection' AS sectionName,
  13 AS sectionOrder,
  'F' AS itemLetter,
  'Restoration signal confirmed transmitted to FSRC following alarm reset.' AS itemDescription,
  'test' AS requirementType,
  'checkbox' AS inputType,
  1 AS isRequired,
  0 AS hasSubItems,
  NULL AS notApplicableNote,
  'ulc_s536' AS standardId,
  '2019' AS standardVersion,
  '2019-01-01' AS effectiveDate,
  1 AS isActive
) AS tmp WHERE NOT EXISTS (
  SELECT 1 FROM `fire_alarm_checklist_templates` WHERE `sectionOrder` = 13 AND `itemLetter` = 'F'
);

INSERT INTO `fire_alarm_checklist_templates`
  (`sectionName`, `sectionOrder`, `itemLetter`, `itemDescription`, `requirementType`, `inputType`,
   `isRequired`, `hasSubItems`, `notApplicableNote`,
   `standardId`, `standardVersion`, `effectiveDate`, `isActive`)
SELECT * FROM (SELECT
  'Fire Signal Receiving Centre (FSRC) Interconnection' AS sectionName,
  13 AS sectionOrder,
  'G' AS itemLetter,
  'FSRC communication path supervision (line fault) results in a trouble condition at the control unit.' AS itemDescription,
  'test' AS requirementType,
  'checkbox' AS inputType,
  1 AS isRequired,
  0 AS hasSubItems,
  NULL AS notApplicableNote,
  'ulc_s536' AS standardId,
  '2019' AS standardVersion,
  '2019-01-01' AS effectiveDate,
  1 AS isActive
) AS tmp WHERE NOT EXISTS (
  SELECT 1 FROM `fire_alarm_checklist_templates` WHERE `sectionOrder` = 13 AND `itemLetter` = 'G'
);

INSERT INTO `fire_alarm_checklist_templates`
  (`sectionName`, `sectionOrder`, `itemLetter`, `itemDescription`, `requirementType`, `inputType`,
   `isRequired`, `hasSubItems`, `notApplicableNote`,
   `standardId`, `standardVersion`, `effectiveDate`, `isActive`)
SELECT * FROM (SELECT
  'Fire Signal Receiving Centre (FSRC) Interconnection' AS sectionName,
  13 AS sectionOrder,
  'H' AS itemLetter,
  'Dual communication paths verified operational (where installed).' AS itemDescription,
  'test' AS requirementType,
  'checkbox' AS inputType,
  0 AS isRequired,
  0 AS hasSubItems,
  'Single communication path only.' AS notApplicableNote,
  'ulc_s536' AS standardId,
  '2019' AS standardVersion,
  '2019-01-01' AS effectiveDate,
  1 AS isActive
) AS tmp WHERE NOT EXISTS (
  SELECT 1 FROM `fire_alarm_checklist_templates` WHERE `sectionOrder` = 13 AND `itemLetter` = 'H'
);
