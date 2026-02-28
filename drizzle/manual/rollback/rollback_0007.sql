-- Rollback: 0007_add_foreign_keys_and_indexes
-- Reverses: FK constraints and secondary indexes.

ALTER TABLE `repairs`
  DROP FOREIGN KEY IF EXISTS `fk_repairs_deficiencyId`,
  DROP INDEX IF EXISTS `idx_repairs_deficiencyId`;

ALTER TABLE `deficiencies`
  DROP FOREIGN KEY IF EXISTS `fk_deficiencies_jobId`,
  DROP INDEX IF EXISTS `idx_deficiencies_jobId_status`,
  DROP INDEX IF EXISTS `idx_deficiencies_jobId`;

ALTER TABLE `fire_alarm_inspection_results`
  DROP FOREIGN KEY IF EXISTS `fk_fire_alarm_inspection_results_jobId`,
  DROP INDEX IF EXISTS `idx_fire_alarm_inspection_results_jobId`;

ALTER TABLE `inspection_results`
  DROP FOREIGN KEY IF EXISTS `fk_inspection_results_jobId`,
  DROP INDEX IF EXISTS `idx_inspection_results_jobId_result`,
  DROP INDEX IF EXISTS `idx_inspection_results_jobId`;
