-- Report QA Queue: extend report status enum and add QA note field.
-- Run manually on Railway (PlanetScale does not support ALTER TABLE in transactions).

ALTER TABLE `reports`
  MODIFY COLUMN `status` ENUM('draft','generated','sent','approved','corrections_required','archived') NOT NULL DEFAULT 'draft',
  ADD COLUMN `qaNote` TEXT DEFAULT NULL;
