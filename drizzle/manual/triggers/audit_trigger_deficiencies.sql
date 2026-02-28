-- Audit Triggers: deficiencies
-- Purpose: Capture full row snapshots for insert/update/delete operations.
--          Session variables must be set by withAudit() before any DML.
-- Pre-requisite: audit_log table must exist (migration 0004).

DELIMITER $$

-- ============================================================
-- AFTER INSERT
-- ============================================================
DROP TRIGGER IF EXISTS `audit_deficiencies_ai`$$
CREATE TRIGGER `audit_deficiencies_ai`
AFTER INSERT ON `deficiencies`
FOR EACH ROW
BEGIN
  INSERT INTO `audit_log` (
    `tableName`, `recordId`, `action`,
    `changedById`, `previousValues`, `newValues`,
    `procedureName`, `requestId`, `ipAddress`, `userAgent`
  ) VALUES (
    'deficiencies',
    NEW.`id`,
    'insert',
    @audit_actor,
    NULL,
    JSON_OBJECT(
      'id',                NEW.`id`,
      'jobId',             NEW.`jobId`,
      'deviceId',          NEW.`deviceId`,
      'inspectionResultId',NEW.`inspectionResultId`,
      'reportedById',      NEW.`reportedById`,
      'status',            NEW.`status`,
      'severity',          NEW.`severity`,
      'systemCategory',    NEW.`systemCategory`,
      'title',             NEW.`title`,
      'description',       NEW.`description`,
      'estimatedCost',     NEW.`estimatedCost`,
      'aiModelId',         NEW.`aiModelId`,
      'aiPromptHash',      NEW.`aiPromptHash`,
      'aiGeneratedAt',     NEW.`aiGeneratedAt`,
      'resolvedAt',        NEW.`resolvedAt`,
      'resolvedById',      NEW.`resolvedById`,
      'createdAt',         NEW.`createdAt`,
      'updatedAt',         NEW.`updatedAt`
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
DROP TRIGGER IF EXISTS `audit_deficiencies_au`$$
CREATE TRIGGER `audit_deficiencies_au`
AFTER UPDATE ON `deficiencies`
FOR EACH ROW
BEGIN
  INSERT INTO `audit_log` (
    `tableName`, `recordId`, `action`,
    `changedById`, `previousValues`, `newValues`,
    `procedureName`, `requestId`, `ipAddress`, `userAgent`
  ) VALUES (
    'deficiencies',
    NEW.`id`,
    'update',
    @audit_actor,
    JSON_OBJECT(
      'id',                OLD.`id`,
      'jobId',             OLD.`jobId`,
      'deviceId',          OLD.`deviceId`,
      'inspectionResultId',OLD.`inspectionResultId`,
      'reportedById',      OLD.`reportedById`,
      'status',            OLD.`status`,
      'severity',          OLD.`severity`,
      'systemCategory',    OLD.`systemCategory`,
      'title',             OLD.`title`,
      'description',       OLD.`description`,
      'estimatedCost',     OLD.`estimatedCost`,
      'aiModelId',         OLD.`aiModelId`,
      'aiPromptHash',      OLD.`aiPromptHash`,
      'aiGeneratedAt',     OLD.`aiGeneratedAt`,
      'resolvedAt',        OLD.`resolvedAt`,
      'resolvedById',      OLD.`resolvedById`,
      'createdAt',         OLD.`createdAt`,
      'updatedAt',         OLD.`updatedAt`
    ),
    JSON_OBJECT(
      'id',                NEW.`id`,
      'jobId',             NEW.`jobId`,
      'deviceId',          NEW.`deviceId`,
      'inspectionResultId',NEW.`inspectionResultId`,
      'reportedById',      NEW.`reportedById`,
      'status',            NEW.`status`,
      'severity',          NEW.`severity`,
      'systemCategory',    NEW.`systemCategory`,
      'title',             NEW.`title`,
      'description',       NEW.`description`,
      'estimatedCost',     NEW.`estimatedCost`,
      'aiModelId',         NEW.`aiModelId`,
      'aiPromptHash',      NEW.`aiPromptHash`,
      'aiGeneratedAt',     NEW.`aiGeneratedAt`,
      'resolvedAt',        NEW.`resolvedAt`,
      'resolvedById',      NEW.`resolvedById`,
      'createdAt',         NEW.`createdAt`,
      'updatedAt',         NEW.`updatedAt`
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
DROP TRIGGER IF EXISTS `audit_deficiencies_ad`$$
CREATE TRIGGER `audit_deficiencies_ad`
AFTER DELETE ON `deficiencies`
FOR EACH ROW
BEGIN
  INSERT INTO `audit_log` (
    `tableName`, `recordId`, `action`,
    `changedById`, `previousValues`, `newValues`,
    `procedureName`, `requestId`, `ipAddress`, `userAgent`
  ) VALUES (
    'deficiencies',
    OLD.`id`,
    'delete',
    @audit_actor,
    JSON_OBJECT(
      'id',                OLD.`id`,
      'jobId',             OLD.`jobId`,
      'deviceId',          OLD.`deviceId`,
      'inspectionResultId',OLD.`inspectionResultId`,
      'reportedById',      OLD.`reportedById`,
      'status',            OLD.`status`,
      'severity',          OLD.`severity`,
      'systemCategory',    OLD.`systemCategory`,
      'title',             OLD.`title`,
      'description',       OLD.`description`,
      'estimatedCost',     OLD.`estimatedCost`,
      'aiModelId',         OLD.`aiModelId`,
      'aiPromptHash',      OLD.`aiPromptHash`,
      'aiGeneratedAt',     OLD.`aiGeneratedAt`,
      'resolvedAt',        OLD.`resolvedAt`,
      'resolvedById',      OLD.`resolvedById`,
      'createdAt',         OLD.`createdAt`,
      'updatedAt',         OLD.`updatedAt`
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
-- SHOW TRIGGERS WHERE `Table` = 'deficiencies';
-- Expected: 3 triggers.
