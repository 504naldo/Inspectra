-- Audit Triggers: inspection_results
-- Purpose: Capture full row snapshots for insert/update/delete operations.
--          Session variables @audit_actor, @audit_procedure, @audit_request_id,
--          @audit_ip, @audit_user_agent must be set by the application layer
--          via withAudit() before any DML on this table.
-- Pre-requisite: audit_log table must exist (migration 0004).

DELIMITER $$

-- ============================================================
-- AFTER INSERT
-- ============================================================
DROP TRIGGER IF EXISTS `audit_inspection_results_ai`$$
CREATE TRIGGER `audit_inspection_results_ai`
AFTER INSERT ON `inspection_results`
FOR EACH ROW
BEGIN
  INSERT INTO `audit_log` (
    `tableName`, `recordId`, `action`,
    `changedById`, `previousValues`, `newValues`,
    `procedureName`, `requestId`, `ipAddress`, `userAgent`
  ) VALUES (
    'inspection_results',
    NEW.`id`,
    'insert',
    @audit_actor,
    NULL,
    JSON_OBJECT(
      'id',            NEW.`id`,
      'jobId',         NEW.`jobId`,
      'deviceId',      NEW.`deviceId`,
      'technicianId',  NEW.`technicianId`,
      'result',        NEW.`result`,
      'notes',         NEW.`notes`,
      'testedAt',      NEW.`testedAt`,
      'syncedAt',      NEW.`syncedAt`,
      'walkOrder',     NEW.`walkOrder`,
      'createdAt',     NEW.`createdAt`,
      'updatedAt',     NEW.`updatedAt`
    ),
    @audit_procedure,
    @audit_request_id,
    @audit_ip,
    @audit_user_agent
  );
END$$

-- ============================================================
-- AFTER UPDATE
-- ============================================================
DROP TRIGGER IF EXISTS `audit_inspection_results_au`$$
CREATE TRIGGER `audit_inspection_results_au`
AFTER UPDATE ON `inspection_results`
FOR EACH ROW
BEGIN
  INSERT INTO `audit_log` (
    `tableName`, `recordId`, `action`,
    `changedById`, `previousValues`, `newValues`,
    `procedureName`, `requestId`, `ipAddress`, `userAgent`
  ) VALUES (
    'inspection_results',
    NEW.`id`,
    'update',
    @audit_actor,
    JSON_OBJECT(
      'id',            OLD.`id`,
      'jobId',         OLD.`jobId`,
      'deviceId',      OLD.`deviceId`,
      'technicianId',  OLD.`technicianId`,
      'result',        OLD.`result`,
      'notes',         OLD.`notes`,
      'testedAt',      OLD.`testedAt`,
      'syncedAt',      OLD.`syncedAt`,
      'walkOrder',     OLD.`walkOrder`,
      'createdAt',     OLD.`createdAt`,
      'updatedAt',     OLD.`updatedAt`
    ),
    JSON_OBJECT(
      'id',            NEW.`id`,
      'jobId',         NEW.`jobId`,
      'deviceId',      NEW.`deviceId`,
      'technicianId',  NEW.`technicianId`,
      'result',        NEW.`result`,
      'notes',         NEW.`notes`,
      'testedAt',      NEW.`testedAt`,
      'syncedAt',      NEW.`syncedAt`,
      'walkOrder',     NEW.`walkOrder`,
      'createdAt',     NEW.`createdAt`,
      'updatedAt',     NEW.`updatedAt`
    ),
    @audit_procedure,
    @audit_request_id,
    @audit_ip,
    @audit_user_agent
  );
END$$

-- ============================================================
-- AFTER DELETE
-- ============================================================
DROP TRIGGER IF EXISTS `audit_inspection_results_ad`$$
CREATE TRIGGER `audit_inspection_results_ad`
AFTER DELETE ON `inspection_results`
FOR EACH ROW
BEGIN
  INSERT INTO `audit_log` (
    `tableName`, `recordId`, `action`,
    `changedById`, `previousValues`, `newValues`,
    `procedureName`, `requestId`, `ipAddress`, `userAgent`
  ) VALUES (
    'inspection_results',
    OLD.`id`,
    'delete',
    @audit_actor,
    JSON_OBJECT(
      'id',            OLD.`id`,
      'jobId',         OLD.`jobId`,
      'deviceId',      OLD.`deviceId`,
      'technicianId',  OLD.`technicianId`,
      'result',        OLD.`result`,
      'notes',         OLD.`notes`,
      'testedAt',      OLD.`testedAt`,
      'syncedAt',      OLD.`syncedAt`,
      'walkOrder',     OLD.`walkOrder`,
      'createdAt',     OLD.`createdAt`,
      'updatedAt',     OLD.`updatedAt`
    ),
    NULL,
    @audit_procedure,
    @audit_request_id,
    @audit_ip,
    @audit_user_agent
  );
END$$

DELIMITER ;

-- Verification (run after installing triggers):
-- SHOW TRIGGERS WHERE `Table` = 'inspection_results';
-- Expected: 3 triggers: audit_inspection_results_ai, audit_inspection_results_au, audit_inspection_results_ad
