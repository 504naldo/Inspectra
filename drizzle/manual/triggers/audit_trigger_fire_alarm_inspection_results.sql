-- Audit Triggers: fire_alarm_inspection_results
-- Purpose: Capture full row snapshots for insert/update/delete operations.
--          Session variables must be set by withAudit() before any DML.
-- Pre-requisite: audit_log table must exist (migration 0004).

DELIMITER $$

-- ============================================================
-- AFTER INSERT
-- ============================================================
DROP TRIGGER IF EXISTS `audit_fire_alarm_inspection_results_ai`$$
CREATE TRIGGER `audit_fire_alarm_inspection_results_ai`
AFTER INSERT ON `fire_alarm_inspection_results`
FOR EACH ROW
BEGIN
  INSERT INTO `audit_log` (
    `tableName`, `recordId`, `action`,
    `changedById`, `previousValues`, `newValues`,
    `procedureName`, `requestId`, `ipAddress`, `userAgent`
  ) VALUES (
    'fire_alarm_inspection_results',
    NEW.`id`,
    'insert',
    @audit_actor,
    NULL,
    JSON_OBJECT(
      'id',               NEW.`id`,
      'jobId',            NEW.`jobId`,
      'fireAlarmSystemId',NEW.`fireAlarmSystemId`,
      'checklistItemId',  NEW.`checklistItemId`,
      'result',           NEW.`result`,
      'numericValue',     NEW.`numericValue`,
      'numericValueRaw',  NEW.`numericValueRaw`,
      'unit',             NEW.`unit`,
      'textValue',        NEW.`textValue`,
      'notes',            NEW.`notes`,
      'testedById',       NEW.`testedById`,
      'testedAt',         NEW.`testedAt`,
      'syncedAt',         NEW.`syncedAt`,
      'createdAt',        NEW.`createdAt`,
      'updatedAt',        NEW.`updatedAt`
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
DROP TRIGGER IF EXISTS `audit_fire_alarm_inspection_results_au`$$
CREATE TRIGGER `audit_fire_alarm_inspection_results_au`
AFTER UPDATE ON `fire_alarm_inspection_results`
FOR EACH ROW
BEGIN
  INSERT INTO `audit_log` (
    `tableName`, `recordId`, `action`,
    `changedById`, `previousValues`, `newValues`,
    `procedureName`, `requestId`, `ipAddress`, `userAgent`
  ) VALUES (
    'fire_alarm_inspection_results',
    NEW.`id`,
    'update',
    @audit_actor,
    JSON_OBJECT(
      'id',               OLD.`id`,
      'jobId',            OLD.`jobId`,
      'fireAlarmSystemId',OLD.`fireAlarmSystemId`,
      'checklistItemId',  OLD.`checklistItemId`,
      'result',           OLD.`result`,
      'numericValue',     OLD.`numericValue`,
      'numericValueRaw',  OLD.`numericValueRaw`,
      'unit',             OLD.`unit`,
      'textValue',        OLD.`textValue`,
      'notes',            OLD.`notes`,
      'testedById',       OLD.`testedById`,
      'testedAt',         OLD.`testedAt`,
      'syncedAt',         OLD.`syncedAt`,
      'createdAt',        OLD.`createdAt`,
      'updatedAt',        OLD.`updatedAt`
    ),
    JSON_OBJECT(
      'id',               NEW.`id`,
      'jobId',            NEW.`jobId`,
      'fireAlarmSystemId',NEW.`fireAlarmSystemId`,
      'checklistItemId',  NEW.`checklistItemId`,
      'result',           NEW.`result`,
      'numericValue',     NEW.`numericValue`,
      'numericValueRaw',  NEW.`numericValueRaw`,
      'unit',             NEW.`unit`,
      'textValue',        NEW.`textValue`,
      'notes',            NEW.`notes`,
      'testedById',       NEW.`testedById`,
      'testedAt',         NEW.`testedAt`,
      'syncedAt',         NEW.`syncedAt`,
      'createdAt',        NEW.`createdAt`,
      'updatedAt',        NEW.`updatedAt`
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
DROP TRIGGER IF EXISTS `audit_fire_alarm_inspection_results_ad`$$
CREATE TRIGGER `audit_fire_alarm_inspection_results_ad`
AFTER DELETE ON `fire_alarm_inspection_results`
FOR EACH ROW
BEGIN
  INSERT INTO `audit_log` (
    `tableName`, `recordId`, `action`,
    `changedById`, `previousValues`, `newValues`,
    `procedureName`, `requestId`, `ipAddress`, `userAgent`
  ) VALUES (
    'fire_alarm_inspection_results',
    OLD.`id`,
    'delete',
    @audit_actor,
    JSON_OBJECT(
      'id',               OLD.`id`,
      'jobId',            OLD.`jobId`,
      'fireAlarmSystemId',OLD.`fireAlarmSystemId`,
      'checklistItemId',  OLD.`checklistItemId`,
      'result',           OLD.`result`,
      'numericValue',     OLD.`numericValue`,
      'numericValueRaw',  OLD.`numericValueRaw`,
      'unit',             OLD.`unit`,
      'textValue',        OLD.`textValue`,
      'notes',            OLD.`notes`,
      'testedById',       OLD.`testedById`,
      'testedAt',         OLD.`testedAt`,
      'syncedAt',         OLD.`syncedAt`,
      'createdAt',        OLD.`createdAt`,
      'updatedAt',        OLD.`updatedAt`
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
-- SHOW TRIGGERS WHERE `Table` = 'fire_alarm_inspection_results';
-- Expected: 3 triggers.
