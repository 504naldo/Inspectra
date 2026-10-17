-- Additive, reviewed production migration. Legacy rows deliberately remain NULL.
-- Do not reconstruct historical device evidence from the current master table.
ALTER TABLE `inspection_results` ADD `deviceSnapshot` json;
ALTER TABLE `deficiencies` ADD `deviceSnapshot` json;
