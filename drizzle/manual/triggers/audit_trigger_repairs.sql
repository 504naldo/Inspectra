-- Audit Triggers: repairs
-- Purpose: Capture full row snapshots for insert/update/delete operations.
--          Session variables must be set by withAudit() before any DML.
-- Pre-requisite: audit_log table must exist (migration 0004).

DELIMITER $$

-- ============================================================
-- AFTER INSERT
-- ============================================================
DROP TRIGGER IF EXISTS `audit_repairs_ai`$$
CREATE TRIGGER `audit_repairs_ai`
AFTER INSERT ON `repairs`
FOR EACH ROW
BEGIN
  INSERT INTO `audit_log` (
    `tableName`, `recordId`, `action`,
    `changedById`, `previousValues`, `newValues`,
    `procedureName`, `requestId`, `ipAddress`, `userAgent`
  ) VALUES (
    'repairs',
    NEW.`id`,
    'insert',
    @audit_actor,
    NULL,
    JSON_OBJECT(
      'id',            NEW.`id`,
      'deficiencyId',  NEW.`deficiencyId`,
      'technicianId',  NEW.`technicianId`,
      'status',        NEW.`status`,
      'description',   NEW.`description`,
      'partsUsed',     NEW.`partsUsed`,
      'laborHours',    NEW.`laborHours`,
      'completedAt',   NEW.`completedAt`,
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
DROP TRIGGER IF EXISTS `audit_repairs_au`$$
CREATE TRIGGER `audit_repairs_au`
AFTER UPDATE ON `repairs`
FOR EACH ROW
BEGIN
  INSERT INTO `audit_log` (
    `tableName`, `recordId`, `action`,
    `changedById`, `previousValues`, `newValues`,
    `procedureName`, `requestId`, `ipAddress`, `userAgent`
  ) VALUES (
    'repairs',
    NEW.`id`,
    'update',
    @audit_actor,
    JSON_OBJECT(
      'id',            OLD.`id`,
      'deficiencyId',  OLD.`deficiencyId`,
      'technicianId',  OLD.`technicianId`,
      'status',        OLD.`status`,
      'description',   OLD.`description`,
      'partsUsed',     OLD.`partsUsed`,
      'laborHours',    OLD.`laborHours`,
      'completedAt',   OLD.`completedAt`,
      'createdAt',     OLD.`createdAt`,
      'updatedAt',     OLD.`updatedAt`
    ),
    JSON_OBJECT(
      'id',            NEW.`id`,
      'deficiencyId',  NEW.`deficiencyId`,
      'technicianId',  NEW.`technicianId`,
      'status',        NEW.`status`,
      'description',   NEW.`description`,
      'partsUsed',     NEW.`partsUsed`,
      'laborHours',    NEW.`laborHours`,
      'completedAt',   NEW.`completedAt`,
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
DROP TRIGGER IF EXISTS `audit_repairs_ad`$$
CREATE TRIGGER `audit_repairs_ad`
AFTER DELETE ON `repairs`
FOR EACH ROW
BEGIN
  INSERT INTO `audit_log` (
    `tableName`, `recordId`, `action`,
    `changedById`, `previousValues`, `newValues`,
    `procedureName`, `requestId`, `ipAddress`, `userAgent`
  ) VALUES (
    'repairs',
    OLD.`id`,
    'delete',
    @audit_actor,
    JSON_OBJECT(
      'id',            OLD.`id`,
      'deficiencyId',  OLD.`deficiencyId`,
      'technicianId',  OLD.`technicianId`,
      'status',        OLD.`status`,
      'description',   OLD.`description`,
      'partsUsed',     OLD.`partsUsed`,
      'laborHours',    OLD.`laborHours`,
      'completedAt',   OLD.`completedAt`,
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
-- SHOW TRIGGERS WHERE `Table` = 'repairs';
-- Expected: 3 triggers.
